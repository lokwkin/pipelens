import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { type DateRange } from '@/lib/api';

interface DateRangeSelectorProps {
  dateRange: DateRange;
  onDateRangeChange: (dateRange: DateRange) => void;
}

export default function DateRangeSelector({ dateRange, onDateRangeChange }: DateRangeSelectorProps) {
  const [localDateRange, setLocalDateRange] = useState<DateRange>(dateRange);

  useEffect(() => {
    setLocalDateRange(dateRange);
  }, [dateRange]);

  const handlePresetChange = (preset: string) => {
    const newRange: DateRange = {
      timePreset: preset,
      startDate: preset === 'custom' ? localDateRange.startDate : null,
      endDate: preset === 'custom' ? localDateRange.endDate : null,
    };
    setLocalDateRange(newRange);
    if (preset !== 'custom') {
      onDateRangeChange(newRange);
    }
  };

  const handleApply = () => {
    onDateRangeChange(localDateRange);
  };

  return (
    <div className="flex items-center gap-3">
      <Label htmlFor="time-preset" className="text-sm">
        Range:
      </Label>
      <Select value={localDateRange.timePreset} onValueChange={handlePresetChange}>
        <SelectTrigger id="time-preset" className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="custom">Custom</SelectItem>
          <SelectItem value="5">Last 5 minutes</SelectItem>
          <SelectItem value="15">Last 15 minutes</SelectItem>
          <SelectItem value="30">Last 30 minutes</SelectItem>
          <SelectItem value="60">Last 1 hour</SelectItem>
          <SelectItem value="360">Last 6 hours</SelectItem>
          <SelectItem value="720">Last 12 hours</SelectItem>
          <SelectItem value="1440">Last 24 hours</SelectItem>
          <SelectItem value="2880">Last 2 days</SelectItem>
          <SelectItem value="10080">Last 7 days</SelectItem>
          <SelectItem value="43200">Last 30 days</SelectItem>
        </SelectContent>
      </Select>

      {localDateRange.timePreset === 'custom' && (
        <>
          <Label htmlFor="start-date" className="text-sm">
            From:
          </Label>
          <Input
            id="start-date"
            type="datetime-local"
            value={localDateRange.startDate || ''}
            onChange={(e) =>
              setLocalDateRange({ ...localDateRange, startDate: e.target.value })
            }
            className="w-[160px]"
          />
          <Label htmlFor="end-date" className="text-sm">
            To:
          </Label>
          <Input
            id="end-date"
            type="datetime-local"
            value={localDateRange.endDate || ''}
            onChange={(e) => setLocalDateRange({ ...localDateRange, endDate: e.target.value })}
            className="w-[160px]"
          />
        </>
      )}

      {localDateRange.timePreset === 'custom' && (
        <Button onClick={handleApply} size="sm">
          Apply
        </Button>
      )}
    </div>
  );
}
