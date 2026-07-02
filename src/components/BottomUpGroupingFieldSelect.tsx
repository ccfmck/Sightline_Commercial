import { BOTTOM_UP_ALL_GROUPING_FIELD, BOTTOM_UP_ALL_GROUP_LABEL } from '../types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValueLeft,
} from './ui/select';

interface BottomUpGroupingFieldSelectProps {
  metadataFields: string[];
  value: string;
  onValueChange: (value: string) => void;
}

export function BottomUpGroupingFieldSelect({
  metadataFields,
  value,
  onValueChange,
}: BottomUpGroupingFieldSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValueLeft />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={BOTTOM_UP_ALL_GROUPING_FIELD}>
          {BOTTOM_UP_ALL_GROUP_LABEL}
        </SelectItem>
        {metadataFields.map((field) => (
          <SelectItem key={field} value={field}>
            {field}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
