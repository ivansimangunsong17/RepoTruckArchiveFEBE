import EmptyState from '../common/EmptyState';

function DataTable({ columns, rows, rowKey = 'id' }) {
  return (
    <div className="table-wrap">
      <table className="data-table responsive-data-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.label}>
                  {column.render ? column.render(row[column.key], row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? <EmptyState /> : null}
    </div>
  );
}

export default DataTable;
