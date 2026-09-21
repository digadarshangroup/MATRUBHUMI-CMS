"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import RoleGate from "@/components/access/RoleGate";
import {
  Panel,
  PanelHead,
  PageHead,
  Chip,
  Button,
  Input,
  Select,
  EmptyState,
  SkeletonRows,
} from "@/components/ceo/ui/Primitives";
import {
  Plus,
  Trash2,
  Eye,
  Edit,
  Package,
  CheckCircle,
  XCircle,
  Building,
  Users,
  Phone,
  Mail,
  MapPin,
  FileText,
  Briefcase,
  Filter,
  Download,
  Search,
  Calendar,
  Clock,
  DollarSign,
  AlertCircle,
} from "lucide-react";

export default function VendorsPage() {
  const router = useRouter();
  const [vendors, setVendors] = useState([]);
  const [filteredVendors, setFilteredVendors] = useState([]);
  const [vendorToDelete, setVendorToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalVendors: 0,
    activeVendors: 0,
    pendingVendors: 0,
    totalOrders: 0,
    avgRating: 0,
  });

  // Get unique categories
  const categories = [...new Set(vendors.map((v) => v.category))];

  // Filter vendors based on search and filters
  useEffect(() => {
    let result = vendors;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(term) ||
          v.contactPerson.toLowerCase().includes(term) ||
          v.email.toLowerCase().includes(term) ||
          v.phone.includes(term) ||
          v.gstNumber.toLowerCase().includes(term) ||
          v.category.toLowerCase().includes(term),
      );
    }

    if (statusFilter !== "all") {
      result = result.filter((v) => v.status === statusFilter);
    }

    if (categoryFilter !== "all") {
      result = result.filter((v) => v.category === categoryFilter);
    }

    setFilteredVendors(result);
  }, [vendors, searchTerm, statusFilter, categoryFilter]);

  const handleEditVendor = (id) => {
    router.push(`/hr/dashboard/vendors/edit/${id}`);
  };

  const handleViewVendor = (id) => {
    router.push(`/hr/dashboard/vendors/view/${id}`);
  };

  const handleExportData = () => {
    // In a real app, this would generate and download a CSV/Excel file
    alert(
      "Export functionality would generate a CSV file in a real application",
    );
  };

  // Stat Card Component
  const StatCard = ({
    title,
    value,
    icon: Icon,
    color = "text-ink",
    bgColor = "bg-[var(--control)]",
  }) => (
    <Panel label={title} className="flex items-center gap-4">
      <div className={`shrink-0 rounded-inset p-3 ${bgColor}`}>
        <Icon className={`h-6 w-6 ${color}`} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-ink-faint">{title}</p>
        <p
          data-figure
          className="mt-1 text-[22px] leading-none tracking-[-0.025em] text-ink"
        >
          {value}
        </p>
      </div>
    </Panel>
  );

  const fetchVendors = async () => {
    try {
      setLoading(true);
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

      const params = new URLSearchParams({
        page: 1,
        limit: 50,
        ...(searchTerm && { search: searchTerm }),
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(categoryFilter !== "all" && { category: categoryFilter }),
      }).toString();

      const response = await fetch(`${API_URL}/api/hr/vendors?${params}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch vendors");
      }

      const data = await response.json();

      if (data.success) {
        setVendors(data.data);
        setFilteredVendors(data.data);
      } else {
        setVendors([]);
        setFilteredVendors([]);
      }
    } catch (error) {
      console.error("Error fetching vendors:", error);
      // Set empty arrays on error
      setVendors([]);
      setFilteredVendors([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchVendorStats = async () => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const response = await fetch(
        `${API_URL}/api/hr/vendors/dashboard/stats`,
        {
          credentials: "include",
        },
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.data);
          return;
        }
      }

      // If API fails, use empty stats
      setStats({
        totalVendors: 0,
        activeVendors: 0,
        inactiveVendors: 0,
        pendingVendors: 0,
        totalOrders: 0,
        avgRating: 0,
        categories: [],
        recent: [],
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error("Error fetching vendor stats:", error);
      setStats({
        totalVendors: 0,
        activeVendors: 0,
        inactiveVendors: 0,
        pendingVendors: 0,
        totalOrders: 0,
        avgRating: 0,
        categories: [],
        recent: [],
        lastUpdated: new Date(),
      });
    }
  };

  useEffect(() => {
    fetchVendors();
    fetchVendorStats();
  }, [searchTerm, statusFilter, categoryFilter]);

  // Update delete function
  const handleDeleteVendor = async (id) => {
    try {
      const API_URL =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const response = await fetch(`${API_URL}/api/hr/vendors/${id}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await response.json();

      if (data.success) {
        // Remove from local state
        setVendors(vendors.filter((v) => v._id !== id));
        setVendorToDelete(null);
        alert("Vendor deleted successfully");

        // Refresh stats
        fetchVendorStats();
      } else {
        alert(data.message || "Failed to delete vendor");
      }
    } catch (error) {
      console.error("Error deleting vendor:", error);
      alert("Failed to delete vendor");
    }
  };

  // Update stats cards
  const totalVendors = stats.totalVendors || vendors.length;
  const activeVendors =
    stats.activeVendors || vendors.filter((v) => v.status === "active").length;
  const totalOrders =
    stats.totalOrders ||
    vendors.reduce((sum, v) => sum + (v.totalOrders || 0), 0);

  // Call fetch functions
  useEffect(() => {
    fetchVendors();
    fetchVendorStats();
  }, [searchTerm, statusFilter, categoryFilter]);

  return (
    <DashboardLayout activeMenu="vendors">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* ---------- HEADER ---------- */}
        <PageHead
          kicker="Human resources"
          title="Vendor Management"
          sub="Manage fabric suppliers, stitching units & accessory vendors"
          actions={
            <>
              <Button tone="secondary" onClick={handleExportData}>
                <Download className="h-4 w-4" />
                Export
              </Button>
              <RoleGate min="editor">
                <Button
                  tone="primary"
                  onClick={() => router.push("/hr/dashboard/vendors/new")}
                >
                  <Plus className="h-4 w-4" />
                  Add Vendor
                </Button>
              </RoleGate>
            </>
          }
        />

        {/* ---------- STATS ---------- */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total Vendors"
            value={totalVendors}
            icon={Building}
            color="text-ink"
            bgColor="bg-[var(--control)]"
          />
          <StatCard
            title="Active Vendors"
            value={activeVendors}
            icon={CheckCircle}
            color="text-[var(--state-positive-ink)]"
            bgColor="bg-[color-mix(in_srgb,var(--state-positive)_24%,transparent)]"
          />
          <StatCard
            title="Total Orders"
            value={totalOrders}
            icon={Package}
            color="text-[var(--state-risk-ink)]"
            bgColor="bg-[color-mix(in_srgb,var(--state-risk)_24%,transparent)]"
          />
        </div>

        {/* ---------- FILTERS ---------- */}
        <Panel label="Filters" className="mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <Input
                  type="text"
                  placeholder="Search vendors by name, contact, GST..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-auto"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>

              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-auto"
              >
                <option value="all">All Categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>

              <Button
                tone="secondary"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                  setCategoryFilter("all");
                }}
              >
                <Filter className="h-4 w-4" />
                Clear Filters
              </Button>
            </div>
          </div>
        </Panel>

        {/* ---------------- TABLE ---------------- */}
        <Panel label="Vendors" padded={false}>
          <div className="px-5 pt-4">
            <PanelHead
              title="Vendors"
              sub="Suppliers, stitching units and accessory partners"
            />
          </div>
          {loading ? (
            <div className="px-5 pb-4">
              <SkeletonRows rows={6} />
            </div>
          ) : filteredVendors.length === 0 ? (
            <EmptyState
              title="No vendors match this view"
              body="Clear the filters or add a vendor to get started."
            />
          ) : (
            <div className="scroll-slim overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                      Vendor
                    </th>
                    <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                      Contact
                    </th>
                    <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                      Business
                    </th>
                    <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                      Performance
                    </th>
                    <th className="border-b border-hairline px-3 py-2.5 text-left text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                      Status
                    </th>
                    <th className="border-b border-hairline px-3 py-2.5 text-right text-[11px] font-medium tracking-[0.09em] text-ink-faint uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredVendors.map((v) => (
                    <tr
                      key={v._id || v.id}
                      className="transition-colors hover:bg-[var(--row-hover)]"
                    >
                      {/* Vendor */}
                      <td className="border-b border-hairline px-3 py-2.5">
                        <p className="text-sm font-medium text-ink">{v.name}</p>
                        <p data-figure className="text-xs text-ink-faint">
                          {v.vendorCode}
                        </p>
                        <span className="text-xs text-ink-muted">
                          {v.category}
                        </span>
                      </td>

                      {/* Contact */}
                      <td className="border-b border-hairline px-3 py-2.5">
                        <p className="text-sm text-ink">{v.contactPerson}</p>
                        <div className="flex items-center gap-1 text-xs text-ink-faint">
                          <Phone className="h-3 w-3" />
                          <span data-figure>{v.phone}</span>
                        </div>
                      </td>

                      {/* Business */}
                      <td className="border-b border-hairline px-3 py-2.5">
                        <div className="flex items-center gap-1.5 text-sm text-ink">
                          <Clock className="h-4 w-4 text-ink-faint" />
                          <span data-figure>{v.leadTime || "—"}</span>
                        </div>
                      </td>

                      {/* Performance */}
                      <td className="border-b border-hairline px-3 py-2.5">
                        <p className="text-sm text-ink">
                          Orders:{" "}
                          <span data-figure className="font-medium">
                            {v.totalOrders}
                          </span>
                        </p>
                        <p className="text-xs text-ink-faint">
                          On-time:{" "}
                          <span data-figure>{v.onTimeDelivery || 0}%</span>
                        </p>
                      </td>

                      <td className="border-b border-hairline px-3 py-2.5">
                        <Chip
                          tone={v.status === "active" ? "positive" : "overdue"}
                        >
                          {v.status}
                        </Chip>
                      </td>

                      {/* Actions */}
                      <td className="border-b border-hairline px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            aria-label="View vendor"
                            className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                            onClick={() =>
                              router.push(`/hr/dashboard/vendors/view/${v._id}`)
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <RoleGate min="editor">
                            <button
                              type="button"
                              aria-label="Edit vendor"
                              className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
                              onClick={() =>
                                router.push(
                                  `/hr/dashboard/vendors/edit/${v._id}`,
                                )
                              }
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                          </RoleGate>
                          <RoleGate min="owner">
                            <button
                              type="button"
                              aria-label="Delete vendor"
                              className="rounded-full p-1.5 text-[var(--state-overdue-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)]"
                              onClick={() => setVendorToDelete(v)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </RoleGate>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* ---------- PAGINATION ---------- */}
        {filteredVendors.length > 0 && (
          <div className="mt-6 flex items-center justify-between gap-4">
            <p className="text-sm text-ink-muted">
              Showing <span data-figure>{filteredVendors.length}</span> of{" "}
              <span data-figure>{vendors.length}</span> vendors
            </p>
            <div className="flex items-center gap-2">
              <Button tone="secondary" size="sm">
                Previous
              </Button>
              <span
                data-figure
                className="rounded-full bg-ink px-3 py-1 text-sm text-[var(--body-bg)]"
              >
                1
              </span>
              <Button tone="secondary" size="sm">
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- DELETE CONFIRMATION MODAL ---------- */}
      {vendorToDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/55 p-3 sm:p-6">
          <div className="frost-bar flex max-h-full w-full min-h-0 max-w-md flex-col rounded-panel border border-hairline">
            <div className="flex items-center gap-3 border-b border-hairline px-5 py-4">
              <div className="rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)] p-2">
                <Trash2 className="h-5 w-5 text-[var(--state-overdue-ink)]" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                  Delete Vendor
                </h2>
                <p className="mt-1 text-xs text-ink-faint">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <p className="text-sm text-ink-muted">
                Are you sure you want to delete{" "}
                <span className="font-medium text-ink">
                  {vendorToDelete.name}
                </span>
                ?
              </p>
              <div className="mt-3 rounded-inset bg-[color-mix(in_srgb,var(--state-overdue)_16%,transparent)] px-3.5 py-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--state-overdue-ink)]" />
                  <p className="text-sm text-[var(--state-overdue-ink)]">
                    All vendor data, documents, and history will be permanently
                    removed.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-hairline px-5 py-4">
              <Button tone="ghost" onClick={() => setVendorToDelete(null)}>
                Cancel
              </Button>
              <RoleGate min="owner">
                <Button
                  tone="destructive"
                  onClick={() => handleDeleteVendor(vendorToDelete._id)}
                >
                  Delete Vendor
                </Button>
              </RoleGate>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
