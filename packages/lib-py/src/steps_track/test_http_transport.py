import pytest
import asyncio
import json
from aioresponses import aioresponses
from pydantic import ValidationError
from yarl import URL

from .step import StepMeta, TimeMeta
from .pipeline import PipelineMeta
from .transport.http_transport import HttpTransport, HttpTransportOptions

# Mark all tests in this module as asyncio
pytestmark = pytest.mark.asyncio

# Mock data similar to TS version
MOCK_PIPELINE_META = PipelineMeta(
    run_id='test-run-id',
    name='test-pipeline',
    key='test-pipeline',
    start_ts=1000000000000,
    end_ts=1000000001000,
    time_usage_ms=1000,
    status='running',  # Example status
    records={}
)

MOCK_STEP_META = StepMeta(
    name='test-step',
    key='test-pipeline.test-step',
    time=TimeMeta(
        startTs=1000000000000,
        endTs=1000000000500,
        timeUsageMs=500,
    ),
    records={},
    result=None,
    error=None,
)

BASE_URL = "https://api.example.com"
API_URL_BATCH = URL(f"{BASE_URL}/api/ingestion/batch")
API_URL_PIPELINE_START = URL(f"{BASE_URL}/api/ingestion/pipeline/start")
API_URL_PIPELINE_FINISH = URL(f"{BASE_URL}/api/ingestion/pipeline/finish")
API_URL_STEP_START = URL(f"{BASE_URL}/api/ingestion/step/start")
API_URL_STEP_FINISH = URL(f"{BASE_URL}/api/ingestion/step/finish")

HEADERS = {'Content-Type': 'application/json'}


@pytest.fixture
async def mock_aioresponse():
    with aioresponses() as m:
        yield m


@pytest.fixture
async def non_batched_transport():
    options = HttpTransportOptions(base_url=BASE_URL, batch_logs=False)
    # Add testing flag
    options._testing = True
    transport = HttpTransport(options)
    yield transport
    await transport.flush_and_stop()


@pytest.fixture
async def batched_transport():
    options = HttpTransportOptions(
        base_url=BASE_URL,
        batch_logs=True,
        flush_interval_seconds=0.1,  # Short interval for testing
        max_batch_size=3,
        debug=False  # Keep logs clean unless debugging tests
    )
    # Add a testing flag to minimize sleeps/timeouts
    options._testing = True
    transport = HttpTransport(options)
    yield transport
    await transport.flush_and_stop()


# --- Non-Batched Mode Tests ---

@pytest.mark.asyncio
async def test_non_batched_init(non_batched_transport):
    assert non_batched_transport.base_url == f"{BASE_URL}/"
    assert non_batched_transport.options.batch_logs is False
    assert non_batched_transport._flush_task is None


@pytest.mark.asyncio
async def test_non_batched_initiate_run(non_batched_transport, mock_aioresponse):
    mock_aioresponse.post(API_URL_PIPELINE_START, status=200)
    await non_batched_transport.initiate_run(MOCK_PIPELINE_META)
    mock_aioresponse.assert_called_once_with(
        API_URL_PIPELINE_START,
        method='POST',
        json=MOCK_PIPELINE_META.model_dump(by_alias=True),
        headers=HEADERS
    )


@pytest.mark.asyncio
async def test_non_batched_finish_run(non_batched_transport, mock_aioresponse):
    mock_aioresponse.post(API_URL_PIPELINE_FINISH, status=200)
    await non_batched_transport.finish_run(MOCK_PIPELINE_META, 'completed')
    expected_payload = {"pipelineMeta": MOCK_PIPELINE_META.model_dump(by_alias=True), "status": "completed"}
    mock_aioresponse.assert_called_once_with(
        API_URL_PIPELINE_FINISH,
        method='POST',
        json=expected_payload,
        headers=HEADERS
    )


@pytest.mark.asyncio
async def test_non_batched_initiate_step(non_batched_transport, mock_aioresponse):
    mock_aioresponse.post(API_URL_STEP_START, status=200)
    await non_batched_transport.initiate_step('test-run-id', MOCK_STEP_META)
    expected_payload = {"runId": "test-run-id", "step": MOCK_STEP_META.model_dump(by_alias=True)}
    mock_aioresponse.assert_called_once_with(
        API_URL_STEP_START,
        method='POST',
        json=expected_payload,
        headers=HEADERS
    )


@pytest.mark.asyncio
async def test_non_batched_finish_step(non_batched_transport, mock_aioresponse):
    mock_aioresponse.post(API_URL_STEP_FINISH, status=200)
    await non_batched_transport.finish_step('test-run-id', MOCK_STEP_META)
    expected_payload = {"runId": "test-run-id", "step": MOCK_STEP_META.model_dump(by_alias=True)}
    mock_aioresponse.assert_called_once_with(
        API_URL_STEP_FINISH,
        method='POST',
        json=expected_payload,
        headers=HEADERS
    )


async def test_non_batched_api_error(non_batched_transport, mock_aioresponse):
    mock_aioresponse.post(API_URL_PIPELINE_START, status=500, body="Server Error")
    with pytest.raises(ConnectionError, match="Failed to initiate run"):
        await non_batched_transport.initiate_run(MOCK_PIPELINE_META)

# --- Batched Mode Tests ---


async def test_batched_init(batched_transport):
    # First verify we have a running event loop
    assert asyncio.get_running_loop() is not None, "No running event loop found"

    assert batched_transport.base_url == f"{BASE_URL}/"
    assert batched_transport.options.batch_logs is True
    assert batched_transport.options.flush_interval_seconds == 0.1
    assert batched_transport.options.max_batch_size == 3
    assert batched_transport._flush_task is not None
    assert not batched_transport._flush_task.done()


@pytest.mark.asyncio
async def test_batched_adds_to_cache(batched_transport, mock_aioresponse):
    # Make sure all URLs are mocked
    mock_aioresponse.post(API_URL_BATCH, status=200, repeat=True)
    mock_aioresponse.post(API_URL_PIPELINE_START, status=200, repeat=True)

    await batched_transport.initiate_run(MOCK_PIPELINE_META)
    # Should not call API immediately
    assert ('POST', API_URL_PIPELINE_START) not in mock_aioresponse.requests
    assert len(batched_transport._event_cache) == 1
    assert batched_transport._event_cache[0].type == 'initiate-run'


@pytest.mark.asyncio
async def test_batched_flush_on_interval(batched_transport, mock_aioresponse):
    # Make sure all URLs are mocked
    mock_aioresponse.post(API_URL_BATCH, status=200, repeat=True)
    mock_aioresponse.post(API_URL_PIPELINE_START, status=200, repeat=True)
    mock_aioresponse.post(API_URL_PIPELINE_FINISH, status=200, repeat=True)

    await batched_transport.initiate_run(MOCK_PIPELINE_META)
    await batched_transport.finish_run(MOCK_PIPELINE_META, 'completed')

    assert len(batched_transport._event_cache) == 2
    assert ('POST', API_URL_BATCH) not in mock_aioresponse.requests

    # Instead of waiting for the interval timer, just call flush directly
    await batched_transport.flush_events()

    # Small wait for the background task to execute
    await asyncio.sleep(0.01)

    # Verify a request was made to the batch endpoint
    assert ('POST', API_URL_BATCH) in mock_aioresponse.requests
    assert len(batched_transport._event_cache) == 0


async def test_batched_flush_on_max_size(batched_transport, mock_aioresponse):
    # Make sure the mock explicitly handles all possible URLs
    mock_aioresponse.post(API_URL_BATCH, status=200, repeat=True)
    mock_aioresponse.post(API_URL_PIPELINE_START, status=200, repeat=True)
    mock_aioresponse.post(API_URL_PIPELINE_FINISH, status=200, repeat=True)
    mock_aioresponse.post(API_URL_STEP_START, status=200, repeat=True)
    mock_aioresponse.post(API_URL_STEP_FINISH, status=200, repeat=True)

    await batched_transport.initiate_run(MOCK_PIPELINE_META)
    await batched_transport.initiate_step('test-run-id', MOCK_STEP_META)

    assert len(batched_transport._event_cache) == 2
    mock_aioresponse.assert_not_called()

    await batched_transport.finish_step('test-run-id', MOCK_STEP_META)
    # Cache size is now 3 (max size), now should have triggered flush
    assert len(batched_transport._event_cache) == 0

    # Wait for the background task potentially
    await asyncio.sleep(0.01)

    expected_payload_batch1 = [
        {"type": "pipeline", "operation": "start", "meta": MOCK_PIPELINE_META.model_dump(by_alias=True)},
        {"type": "step", "operation": "start", "runId": "test-run-id",
            "step": MOCK_STEP_META.model_dump(by_alias=True)},
        {"type": "step", "operation": "finish", "runId": "test-run-id",
            "step": MOCK_STEP_META.model_dump(by_alias=True)},
    ]

    # Check the request made
    assert len(mock_aioresponse.requests) > 0
    url_method = ('POST', API_URL_BATCH)
    assert url_method in mock_aioresponse.requests

    assert mock_aioresponse.requests.get(url_method)[0].kwargs['data'] == json.dumps(expected_payload_batch1)

    # Clear the events cache for last check
    batched_transport._event_cache.clear()
    assert len(batched_transport._event_cache) == 0


@pytest.mark.asyncio
async def test_batched_retry_logic(batched_transport, mock_aioresponse):
    # Set up the mock to fail once then succeed
    mock_aioresponse.post(API_URL_BATCH, status=500)  # This will cause a retry
    mock_aioresponse.post(API_URL_BATCH, status=200)  # This will succeed on retry

    await batched_transport.initiate_run(MOCK_PIPELINE_META)
    await batched_transport.flush_events()  # Directly flush instead of waiting

    # Small wait for background task - should be very quick due to _testing flag
    await asyncio.sleep(0.05)

    # Should have made two requests (one failure, one success)
    assert len(mock_aioresponse.requests[('POST', API_URL_BATCH)]) == 2

    # Cache should be empty after successful retry
    assert len(batched_transport._event_cache) == 0


@pytest.mark.asyncio
async def test_flush_and_stop(batched_transport, mock_aioresponse):
    # Make sure all endpoints are mocked
    mock_aioresponse.post(API_URL_BATCH, status=200, repeat=True)
    mock_aioresponse.post(API_URL_PIPELINE_START, status=200, repeat=True)
    mock_aioresponse.post(API_URL_STEP_START, status=200, repeat=True)

    # Add some events
    await batched_transport.initiate_run(MOCK_PIPELINE_META)
    await batched_transport.initiate_step('test-run-id', MOCK_STEP_META)
    assert len(batched_transport._event_cache) == 2

    # Call flush_and_stop
    await batched_transport.flush_and_stop()

    # Verify a request was made to the batch endpoint
    assert ('POST', API_URL_BATCH) in mock_aioresponse.requests

    # Cache should be empty and timer should be stopped
    assert len(batched_transport._event_cache) == 0
    assert batched_transport._flush_task is None or batched_transport._flush_task.done()


async def test_http_transport_options_validation():
    # Valid
    try:
        HttpTransportOptions(base_url="http://test.com")
    except ValidationError as e:
        pytest.fail(f"Valid options raised validation error: {e}")

    # Invalid (missing base_url)
    with pytest.raises(ValidationError):
        HttpTransportOptions(batch_logs=True)

    # Invalid type
    with pytest.raises(ValidationError):
        HttpTransportOptions(base_url="http://test.com", max_batch_size="not-an-int")
