import pytest
import io
import re  # Keep re for assertRegex equivalent
from unittest.mock import patch, MagicMock  # Keep unittest.mock
from pipelens.chart import (
    TimeSpan,
    GraphItem,
    GanttChartArgs,
    generate_execution_graph_quickchart,
    generate_gantt_chart_quickchart,
    generate_gantt_chart_google
)

# Combine synchronous and asynchronous tests into one class structure
# for better organization with pytest.


class TestChartFunctions:
    """Test cases for chart module functions using pytest"""

    # --- Synchronous Tests ---

    def test_time_span_model(self):
        """Test TimeSpan model creation"""
        # Test required fields
        span = TimeSpan(key="test-span", startTs=1000)
        assert span.key == "test-span"
        assert span.startTs == 1000
        assert span.endTs is None

        # Test with optional fields
        span = TimeSpan(key="test-span", startTs=1000, endTs=2000)
        assert span.key == "test-span"
        assert span.startTs == 1000
        assert span.endTs == 2000

    def test_graph_item_model(self):
        """Test GraphItem model creation"""
        # Test required fields
        item = GraphItem(descriptor="A -> B")
        assert item.descriptor == "A -> B"
        assert item.label is None

        # Test with optional fields
        item = GraphItem(descriptor="A -> B", label="Connection")
        assert item.descriptor == "A -> B"
        assert item.label == "Connection"

    def test_gantt_chart_args_model(self):
        """Test GanttChartArgs model creation and default values"""
        # Test default values
        args = GanttChartArgs()
        assert args.unit == "ms"
        assert args.min_height == 300
        assert args.min_width == 500

        # Test with custom values
        args = GanttChartArgs(unit="s", min_height=400, min_width=600)
        assert args.unit == "s"
        assert args.min_height == 400
        assert args.min_width == 600

    def test_generate_execution_graph_quickchart(self):
        """Test generating execution graph URL"""
        # Test with single item
        items = [GraphItem(descriptor="A -> B")]
        url = generate_execution_graph_quickchart(items)

        assert "quickchart.io/graphviz" in url
        # Check for URL-encoded version
        assert "digraph%20G" in url
        assert "A%20-%3E%20B" in url  # Check for encoded 'A -> B'

        # Test with multiple items and labels
        items = [
            GraphItem(descriptor="A -> B", label="Connection AB"),
            GraphItem(descriptor="B -> C")
        ]
        url = generate_execution_graph_quickchart(items)

        assert "quickchart.io/graphviz" in url
        # Check for URL-encoded versions
        assert "digraph%20G" in url
        assert "A%20-%3E%20B" in url
        assert "B%20-%3E%20C" in url
        # Check for encoded label
        assert 'label%3D%22Connection%20AB%22' in url  # Encoded: label="Connection AB"

    def test_generate_gantt_chart_google(self):
        """Test generating Google Gantt Chart HTML"""
        time_spans = [
            TimeSpan(key="Task 1", startTs=1000, endTs=2000),
            TimeSpan(key="Task 2", startTs=1500, endTs=3000),
            TimeSpan(key="Task 3", startTs=2000, endTs=0)  # Running task
        ]

        html = generate_gantt_chart_google(time_spans)

        # Verify it's proper HTML
        assert html.strip().startswith('<!DOCTYPE html>')
        assert '<html>' in html
        assert '</html>' in html

        # Check for Google Charts inclusion
        assert 'google.charts.load' in html
        assert 'google.visualization.Gantt' in html

        # Check our data is included
        assert 'Task 1' in html
        assert 'Task 2' in html
        assert 'Task 3' in html

        # Check for running task handling
        assert 'Running' in html

        # Check for proper height using regex
        assert re.search(r'height: \d+px', html) is not None

    def test_generate_gantt_chart_google_with_args(self):
        """Test generating Google Gantt Chart HTML with custom args"""
        time_spans = [
            TimeSpan(key="Task 1", startTs=1000, endTs=2000),
            TimeSpan(key="Task 2", startTs=1500, endTs=3000)
        ]

        args = GanttChartArgs(min_height=600)
        html = generate_gantt_chart_google(time_spans, args)

        # Verify custom height
        assert 'height: 600px' in html

    # --- Asynchronous Tests ---

    @pytest.mark.asyncio
    @patch('requests.post')
    async def test_generate_gantt_chart_quickchart(self, mock_post):
        """Test generating Gantt chart PNG with the QuickChart API"""
        # Mock the response
        mock_response = MagicMock()
        mock_response.content = b"mock binary data"
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        # Test with basic time spans
        time_spans = [
            TimeSpan(key="Task 1", startTs=1000, endTs=2000),
            TimeSpan(key="Task 2", startTs=1500, endTs=3000)
        ]

        chart_data = await generate_gantt_chart_quickchart(time_spans)

        # Verify the chart data is a BytesIO object with content
        assert isinstance(chart_data, io.BytesIO)
        assert chart_data.getvalue() == b"mock binary data"

        # Verify the API was called correctly
        mock_post.assert_called_once()
        # Use call_args.kwargs for keyword arguments
        call_args_dict = mock_post.call_args.kwargs

        assert call_args_dict['headers']['Content-Type'] == 'application/json'

        # Verify JSON payload structure
        json_data = call_args_dict['json']
        assert json_data['format'] == 'png'
        # Use >= comparison for flexibility
        assert int(json_data['width']) >= 500
        assert int(json_data['height']) >= 300

        # Verify chart data structure
        chart_config = json_data['chart']
        assert chart_config['type'] == 'horizontalBar'
        assert len(chart_config['data']['labels']) == 2
        assert len(chart_config['data']['datasets'][0]['data']) == 2

    @pytest.mark.asyncio
    @patch('requests.post')
    async def test_generate_gantt_chart_quickchart_with_args(self, mock_post):
        """Test generating Gantt chart with custom arguments"""
        mock_response = MagicMock()
        mock_response.content = b"mock binary data"
        mock_response.raise_for_status = MagicMock()
        mock_post.return_value = mock_response

        time_spans = [
            TimeSpan(key="Task 1", startTs=1000, endTs=2000),
            TimeSpan(key="Task 2", startTs=1500, endTs=3000)
        ]

        args = GanttChartArgs(unit="s", min_height=400, min_width=800)
        await generate_gantt_chart_quickchart(time_spans, args)

        mock_post.assert_called_once()
        call_args_dict = mock_post.call_args.kwargs
        json_data = call_args_dict['json']

        assert int(json_data['width']) >= 800
        assert int(json_data['height']) >= 400

        chart_config = json_data['chart']
        # Use 'in' for substring check, more robust than any()
        assert all("s" in label for label in chart_config['data']['labels'])

    @pytest.mark.asyncio
    @patch('requests.post')
    async def test_generate_gantt_chart_quickchart_error(self, mock_post):
        """Test error handling in generate_gantt_chart_quickchart"""
        mock_post.side_effect = Exception("API error")

        time_spans = [TimeSpan(key="Task 1", startTs=1000, endTs=2000)]

        with pytest.raises(Exception, match="Failed to generate chart with QuickChart API"):
            await generate_gantt_chart_quickchart(time_spans)
