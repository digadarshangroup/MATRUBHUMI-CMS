"use client"

import { Search, Filter } from "lucide-react"
import { useState } from "react"
import {
  Panel,
  Button,
  Input,
  Select,
  Field,
} from "@/components/ceo/ui/Primitives"

export default function EmployeeFilters({ filters, setFilters }) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  const departments = [
    { id: "all", name: "All Departments" },
    { id: "production", name: "Production" },
    { id: "design", name: "Design" },
    { id: "sales", name: "Sales" },
    { id: "quality_control", name: "Quality Control" },
    { id: "inventory", name: "Inventory" },
    { id: "it", name: "IT" },
    { id: "hr", name: "HR" },
  ]

  const statuses = [
    { id: "all", name: "All Status" },
    { id: "active", name: "Active" },
    { id: "inactive", name: "Inactive" },
    { id: "on_leave", name: "On Leave" },
  ]

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearFilters = () => {
    setFilters({
      department: "all",
      status: "all",
      search: "",
    })
  }

  return (
    <Panel label="Employee filters">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        {/* Search Bar */}
        <div className="flex-1">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              type="text"
              aria-label="Search employees"
              placeholder="Search employees by name, email, or position..."
              value={filters.search}
              onChange={(e) => handleFilterChange("search", e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Basic Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            aria-label="Department"
            value={filters.department}
            onChange={(e) => handleFilterChange("department", e.target.value)}
            className="w-auto"
          >
            {departments.map(dept => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </Select>

          <Select
            aria-label="Status"
            value={filters.status}
            onChange={(e) => handleFilterChange("status", e.target.value)}
            className="w-auto"
          >
            {statuses.map(status => (
              <option key={status.id} value={status.id}>{status.name}</option>
            ))}
          </Select>

          <Button size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
            <Filter className="h-4 w-4" />
            More Filters
          </Button>

          <Button tone="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="mt-4 border-t border-hairline pt-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label="Employment Type">
              <Select>
                <option value="">All Types</option>
                <option value="full_time">Full Time</option>
                <option value="part_time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="intern">Intern</option>
              </Select>
            </Field>
            <Field label="Salary Range">
              <Select>
                <option value="">All Salaries</option>
                <option value="0-25000">₹0 - ₹25,000</option>
                <option value="25000-40000">₹25,000 - ₹40,000</option>
                <option value="40000+">₹40,000+</option>
              </Select>
            </Field>
            <Field label="Joining Date">
              <Select>
                <option value="">Any Time</option>
                <option value="last_month">Last Month</option>
                <option value="last_3_months">Last 3 Months</option>
                <option value="last_6_months">Last 6 Months</option>
                <option value="last_year">Last Year</option>
              </Select>
            </Field>
          </div>
        </div>
      )}
    </Panel>
  )
}