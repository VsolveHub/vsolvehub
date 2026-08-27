import { render, screen, fireEvent } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { DataTable } from "./data-table";

interface TestRow {
  id: string;
  name: string;
  amount: number;
}

const columns = [
  { id: "name", header: "Name", cell: (row: TestRow) => row.name, sortable: true },
  { id: "amount", header: "Amount", cell: (row: TestRow) => row.amount, numeric: true },
];

const data: TestRow[] = [
  { id: "1", name: "Alice", amount: 100 },
  { id: "2", name: "Bob", amount: 200 },
];

test("renders table with data", () => {
  render(
    <DataTable
      data={data}
      columns={columns}
      keyExtractor={(row) => row.id}
    />
  );
  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("100")).toBeInTheDocument();
});

test("handles sorting click", () => {
  const onSort = vi.fn();
  render(
    <DataTable
      data={data}
      columns={columns}
      keyExtractor={(row) => row.id}
      onSort={onSort}
    />
  );
  
  fireEvent.click(screen.getByText("Name"));
  expect(onSort).toHaveBeenCalledWith("name");
});

test("renders empty state", () => {
  render(
    <DataTable
      data={[]}
      columns={columns}
      keyExtractor={(row) => row.id}
      emptyMessage="No items found"
    />
  );
  expect(screen.getByText("No items found")).toBeInTheDocument();
});
