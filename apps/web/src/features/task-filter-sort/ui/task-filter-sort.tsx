import { SortMenu } from './sort-menu';
import { StatusFilter } from './status-filter';
import { TaskSearch } from './task-search';

/** Search, status filter and sort for the task list. All three live in the URL. */
export function TaskFilterSort() {
  return (
    <div className="flex items-center gap-2">
      <TaskSearch className="flex-1 md:max-w-72" />
      <StatusFilter />
      <SortMenu />
    </div>
  );
}
