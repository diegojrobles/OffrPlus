import "./DataTable.css";

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyFn: (row: T) => string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  keyFn,
  onRowClick,
}: DataTableProps<T>) {
  return (
    // tabIndex makes the scroll region reachable by keyboard once it overflows.
    <div className="table-wrap card" tabIndex={0} role="group" aria-label="Table">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                scope="col"
                className={[
                  col.className,
                  i === 0 ? "col-sticky" : null,
                  // Row actions pin to the right edge so they stay reachable
                  // no matter how far the table is scrolled.
                  i === columns.length - 1 ? "col-sticky-end" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={keyFn(row)}
              className={onRowClick ? "row-clickable" : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col, i) => (
                <td
                  key={col.key}
                  className={[
                    col.className,
                    i === 0 ? "col-sticky" : null,
                    i === columns.length - 1 ? "col-sticky-end" : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
