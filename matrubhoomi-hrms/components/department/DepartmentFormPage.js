// components/DepartmentFormPage.js
"use client";

import { useState, useEffect } from "react";
import DashboardLayout from "@/components/Hr_DashboardLayout";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  ChevronDown,
  Loader2,
  Users,
  AlertCircle,
  Save,
  X,
  ChevronRight,
  ChevronDown as ChevronDownIcon,
  ChevronUp,
  Building,
  GitBranchPlus,
} from "lucide-react";
import {
  Panel,
  PanelHead,
  Chip,
  Button,
  Field,
  Input,
  Select,
  EmptyState,
  SkeletonRows,
  PageHead,
} from "@/components/ceo/ui/Primitives";

export default function DepartmentFormPage({
  isEditing = false,
  departmentId = null,
}) {
  const router = useRouter();

  const [formData, setFormData] = useState({
    name: "",
    designations: [{ name: "", managers: [] }],
    status: "active",
  });

  const [allDepartments, setAllDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // searchQueries keyed as "desIndex_mgrIndex" so each manager has its own search state
  const [searchQueries, setSearchQueries] = useState({});
  const [activeDropdown, setActiveDropdown] = useState(null); // "desIndex_mgrIndex" or null
  const [designationDesignations, setDesignationDesignations] = useState([[]]);
  const [loadingDesignations, setLoadingDesignations] = useState([false]);
  const [errors, setErrors] = useState({});
  const [expandedDesignations, setExpandedDesignations] = useState([true]); // Track expanded state

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  // Fetch all departments for dropdown
  const fetchAllDepartments = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/hr/departments/with-designations`,
        {
          credentials: "include",
        },
      );
      const data = await response.json();

      if (data.success) {
        setAllDepartments(data.data);
      }
    } catch (error) {
      console.error("Error fetching departments:", error);
    }
  };

  // Fetch department data if editing
  const fetchDepartmentData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${API_URL}/api/hr/departments/${departmentId}`,
        {
          credentials: "include",
        },
      );
      const data = await response.json();

      if (data.success) {
        const department = data.data;

        // Set form data
        const formData = {
          name: department.name || "",
          status: department.status || "active",
          designations:
            department.designations && department.designations.length > 0
              ? department.designations.map((des) => ({
                _id: des._id,
                name: des.name || "",
                managers: des.managers || [],
                isActive: des.isActive !== false,
              }))
              : [{ name: "", managers: [] }],
        };

        setFormData(formData);
        // Initially expand all designations when editing
        setExpandedDesignations(Array(formData.designations.length).fill(true));

        // Initialize designation designations arrays
        const initialDesDesignations = department.designations?.map(() => []) || [[]];
        setDesignationDesignations(initialDesDesignations);
        setLoadingDesignations(department.designations?.map(() => false) || [false]);
        setSearchQueries({});
        setActiveDropdown(null);

        // For each manager, pre-fetch their department designations
        if (department.designations) {
          department.designations.forEach((des, desIndex) => {
            if (des.managers && des.managers.length > 0) {
              // Get unique department IDs from managers
              const uniqueDeptIds = [
                ...new Set(
                  des.managers
                    .map((mgr) => mgr.departmentId)
                    .filter((id) => id),
                ),
              ];

              // Fetch designations for each unique department
              uniqueDeptIds.forEach((deptId) => {
                fetchDesignationsForDepartment(deptId, desIndex);
              });
            }
          });
        }
      } else {
        console.error("Failed to fetch department:", data.message);
      }
    } catch (error) {
      console.error("Error fetching department:", error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch designations for a specific department
  const fetchDesignationsForDepartment = async (
    departmentId,
    designationIndex,
  ) => {
    if (!departmentId) {
      const newDesignations = [...designationDesignations];
      newDesignations[designationIndex] = [];
      setDesignationDesignations(newDesignations);
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/hr/departments/${departmentId}/designations-list`,
        {
          credentials: "include",
        },
      );
      const data = await response.json();

      const newDesignations = [...designationDesignations];
      if (data.success) {
        const existing = newDesignations[designationIndex] || [];
        const newItems = data.data.designations || [];
        const merged = [...new Set([...existing, ...newItems])];
        newDesignations[designationIndex] = merged;
      } else {
        newDesignations[designationIndex] =
          newDesignations[designationIndex] || [];
      }
      setDesignationDesignations(newDesignations);
    } catch (error) {
      console.error("Error fetching designations:", error);
      const newDesignations = [...designationDesignations];
      newDesignations[designationIndex] =
        newDesignations[designationIndex] || [];
      setDesignationDesignations(newDesignations);
    }
  };

  // Initialize form and fetch data
  useEffect(() => {
    const initializeData = async () => {
      await fetchAllDepartments();

      if (isEditing && departmentId) {
        await fetchDepartmentData();
      } else {
        setLoading(false);
        setFormData({
          name: "",
          designations: [{ name: "", managers: [] }],
          status: "active",
        });
        setSearchQueries({});
        setActiveDropdown(null);
        setDesignationDesignations([[]]);
        setLoadingDesignations([false]);
        setExpandedDesignations([true]);
      }
    };

    initializeData();
  }, [isEditing, departmentId]);

  const getFilteredDepartments = (desIndex, mgrIndex) => {
    const key = getMgrKey(desIndex, mgrIndex);
    const searchQuery = searchQueries[key] || "";
    return allDepartments.filter(
      (dept) =>
        dept.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dept.designations.some((des) =>
          des.toLowerCase().includes(searchQuery.toLowerCase()),
        ),
    );
  };

  const handleAddDesignation = () => {
    setFormData({
      ...formData,
      designations: [...formData.designations, { name: "", managers: [] }],
    });
    setDesignationDesignations([...designationDesignations, []]);
    setLoadingDesignations([...loadingDesignations, false]);
    setExpandedDesignations([...expandedDesignations, true]);
  };

  const handleRemoveDesignation = (index) => {
    if (formData.designations.length <= 1) return;

    const newDesignations = formData.designations.filter((_, i) => i !== index);
    setFormData({ ...formData, designations: newDesignations });

    const newDesignationDesignations = designationDesignations.filter((_, i) => i !== index);
    setDesignationDesignations(newDesignationDesignations);

    const newLoadingDesignations = loadingDesignations.filter((_, i) => i !== index);
    setLoadingDesignations(newLoadingDesignations);

    const newExpandedDesignations = expandedDesignations.filter((_, i) => i !== index);
    setExpandedDesignations(newExpandedDesignations);
  };

  const toggleDesignationExpansion = (index) => {
    const newExpandedDesignations = [...expandedDesignations];
    newExpandedDesignations[index] = !newExpandedDesignations[index];
    setExpandedDesignations(newExpandedDesignations);
  };

  const handleDesignationNameChange = (index, value) => {
    const newDesignations = [...formData.designations];
    newDesignations[index].name = value;
    setFormData({ ...formData, designations: newDesignations });
  };

  const handleAddManager = (designationIndex) => {
    const newDesignations = [...formData.designations];
    newDesignations[designationIndex].managers = [
      ...newDesignations[designationIndex].managers,
      { departmentId: "", departmentName: "", designationName: "" },
    ];
    setFormData({ ...formData, designations: newDesignations });
  };

  const handleRemoveManager = (designationIndex, managerIndex) => {
    const newDesignations = [...formData.designations];
    newDesignations[designationIndex].managers = newDesignations[
      designationIndex
    ].managers.filter((_, i) => i !== managerIndex);
    setFormData({ ...formData, designations: newDesignations });
  };

  const getMgrKey = (desIndex, mgrIndex) => `${desIndex}_${mgrIndex}`;

  const handleSearchChange = (desIndex, mgrIndex, value) => {
    setSearchQueries(prev => ({ ...prev, [getMgrKey(desIndex, mgrIndex)]: value }));
    setActiveDropdown(value.length > 0 ? getMgrKey(desIndex, mgrIndex) : null);
  };

  const handleSelectDepartment = (
    designationIndex,
    managerIndex,
    department,
  ) => {
    const newDesignations = [...formData.designations];
    newDesignations[designationIndex].managers[managerIndex] = {
      departmentId: department.id,
      departmentName: department.name,
      designationName:
        newDesignations[designationIndex].managers[managerIndex]
          ?.designationName || "",
    };
    setFormData({ ...formData, designations: newDesignations });

    // Clear search and close dropdown for this manager
    setSearchQueries(prev => ({ ...prev, [getMgrKey(designationIndex, managerIndex)]: "" }));
    setActiveDropdown(null);

    fetchDesignationsForDepartment(department.id, designationIndex);
  };

  const handleSelectDesignation = (
    designationIndex,
    managerIndex,
    designation,
  ) => {
    const newDesignations = [...formData.designations];
    newDesignations[designationIndex].managers[managerIndex].designationName =
      designation;
    setFormData({ ...formData, designations: newDesignations });
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Department name is required";
    }

    formData.designations.forEach((des, index) => {
      if (!des.name.trim()) {
        newErrors[`designation_${index}`] = "Designation name is required";
      }

      des.managers.forEach((mgr, mgrIndex) => {
        if (mgr.departmentId && !mgr.designationName) {
          newErrors[`manager_${index}_${mgrIndex}`] =
            "Please select a designation for the manager";
        }
      });
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSubmitting(true);

      const cleanedData = {
        ...formData,
        designations: formData.designations
          .filter((des) => des.name.trim() !== "")
          .map((des) => ({
            ...des,
            name: des.name.trim(),
            isActive: des.isActive !== false,
            managers: des.managers.filter(
              (mgr) => mgr.departmentId && mgr.designationName,
            ),
          })),
      };

      const url = isEditing
        ? `${API_URL}/api/hr/departments/${departmentId}`
        : `${API_URL}/api/hr/departments`;

      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(cleanedData),
      });

      const data = await response.json();

      if (data.success) {
        alert(
          isEditing
            ? "Department updated successfully!"
            : "Department created successfully!",
        );
        router.push("/hr/dashboard/departments");
        router.refresh();
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (error) {
      console.error("Error saving department:", error);
      alert(`Failed to ${isEditing ? "update" : "create"} department`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout activeMenu="Departments">
        <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
          <Panel label="Loading department data">
            <SkeletonRows rows={6} />
          </Panel>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeMenu="Departments">
      <div className="mx-auto max-w-[1480px] px-4 py-6 deck:px-8">
        {/* Compact Header */}
        <PageHead
          kicker="Human resources"
          title={isEditing ? "Edit Department" : "Create New Department"}
          sub={isEditing ? "Edit Mode" : "Create Mode"}
          actions={
            <Link
              href="/hr/dashboard/departments"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-[var(--control)] hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Departments
            </Link>
          }
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left Column: Department Details */}
          <div className="space-y-4 lg:col-span-1">
            {/* Department Details Card */}
            <Panel label="Department details">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                  <Building className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                    Department Details
                  </h2>
                  <p className="mt-1 text-xs text-ink-faint">Basic information</p>
                </div>
              </div>

              <div className="space-y-4">
                <Field label="Department Name" required error={errors.name}>
                  <Input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="e.g., IT Department"
                  />
                </Field>

                <Field label="Status">
                  <Select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </Select>
                </Field>
              </div>

              {/* Stats */}
              <div className="mt-6 border-t border-hairline pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-inset bg-[var(--surface-sunken)] p-3 text-center">
                    <div className="text-xs text-ink-faint">Designations</div>
                    <div
                      data-figure
                      className="mt-1 text-[17px] leading-none tracking-[-0.025em] text-ink"
                    >
                      {formData.designations.length}
                    </div>
                  </div>
                  <div className="rounded-inset bg-[var(--surface-sunken)] p-3 text-center">
                    <div className="text-xs text-ink-faint">Total Managers</div>
                    <div
                      data-figure
                      className="mt-1 text-[17px] leading-none tracking-[-0.025em] text-ink"
                    >
                      {formData.designations.reduce(
                        (total, des) => total + (des.managers?.length || 0),
                        0,
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            {/* Actions Card */}
            <Panel label="Actions">
              <PanelHead title="Actions" />
              <div className="flex flex-col gap-3">
                <Button
                  type="button"
                  onClick={handleAddDesignation}
                  className="w-full"
                >
                  <Plus className="h-4 w-4" />
                  Add Designation
                </Button>
                <div className="flex gap-3">
                  <Link
                    href="/hr/dashboard/departments"
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--control)] px-4 py-2 text-[15px] font-medium tracking-[-0.012em] text-ink transition-colors duration-[180ms] ease-[var(--ease-deck)] hover:bg-[var(--control-hover)]"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Link>
                  <Button
                    type="submit"
                    tone="primary"
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        {isEditing ? "Update" : "Create"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Panel>
          </div>

          {/* Right Column: Designations */}
          <div className="lg:col-span-2">
            <Panel padded={false} label="Designations and managers">
              <div className="border-b border-hairline px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inset bg-[var(--control)] text-ink-muted">
                      <GitBranchPlus className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-[17px] leading-none font-medium tracking-[-0.02em] text-ink">
                        Designations & Managers
                      </h2>
                      <p className="mt-1 text-xs text-ink-faint">
                        <span data-figure>{formData.designations.length}</span> designations added
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="scroll-slim max-h-[calc(100vh-250px)] space-y-4 overflow-y-auto p-5">
                {formData.designations.length === 0 ? (
                  <EmptyState
                    compact
                    title="No designations added yet"
                    body="Add your first designation to get started"
                  />
                ) : (
                  formData.designations.map((designation, desIndex) => {

                    return (
                      <div
                        key={desIndex}
                        className="overflow-hidden rounded-inset border border-hairline"
                      >
                        {/* Designation Header */}
                        <div
                          className="cursor-pointer border-b border-hairline bg-[var(--surface-sunken)] px-4 py-3 transition-colors hover:bg-[var(--control)]"
                          onClick={() => toggleDesignationExpansion(desIndex)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <button
                                type="button"
                                className="shrink-0 text-ink-muted transition-colors hover:text-ink"
                              >
                                {expandedDesignations[desIndex] ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="text"
                                    required
                                    className="flex-1 py-1.5"
                                    value={designation.name}
                                    onChange={(e) =>
                                      handleDesignationNameChange(
                                        desIndex,
                                        e.target.value,
                                      )
                                    }
                                    placeholder="Designation name"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <Chip>
                                    <span data-figure>{designation.managers?.length || 0}</span> managers
                                  </Chip>
                                </div>
                                {errors[`designation_${desIndex}`] && (
                                  <p className="mt-1.5 flex items-center gap-1 text-xs text-[var(--state-overdue-ink)]">
                                    <AlertCircle className="h-3 w-3" />
                                    {errors[`designation_${desIndex}`]}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleAddManager(desIndex)}
                                className="inline-grid h-8 w-8 place-items-center rounded-full text-ink-muted transition-colors hover:bg-[var(--control-hover)] hover:text-ink"
                                title="Add Manager"
                              >
                                <Users className="h-4 w-4" />
                              </button>
                              {formData.designations.length > 1 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveDesignation(desIndex);
                                  }}
                                  className="inline-grid h-8 w-8 place-items-center rounded-full text-[var(--state-overdue-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)]"
                                  title="Remove Designation"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {expandedDesignations[desIndex] && (
                          <div className="bg-[var(--surface-raised)] p-4">
                            {/* Managers List */}
                            {designation.managers.length === 0 ? (
                              <div className="mb-4">
                                <EmptyState
                                  compact
                                  title="No managers added"
                                  body="Add managers who can approve requests"
                                />
                              </div>
                            ) : (
                              <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                                {designation.managers.map(
                                  (manager, mgrIndex) => (
                                    <div
                                      key={mgrIndex}
                                      className="rounded-inset border border-hairline bg-[var(--surface-sunken)] p-3"
                                    >
                                      <div className="mb-3 flex items-center justify-between">
                                        <span className="text-xs font-medium text-ink">
                                          Manager <span data-figure>{mgrIndex + 1}</span>
                                        </span>
                                        {designation.managers.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleRemoveManager(
                                                desIndex,
                                                mgrIndex,
                                              )
                                            }
                                            className="inline-grid h-6 w-6 place-items-center rounded-full text-[var(--state-overdue-ink)] transition-colors hover:bg-[color-mix(in_srgb,var(--state-overdue)_22%,transparent)]"
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>

                                      {/* Department Selection */}
                                      <div className="mb-3">
                                        <span className="mb-1.5 block text-sm font-medium text-ink">
                                          Department
                                        </span>
                                        {manager.departmentName && activeDropdown !== getMgrKey(desIndex, mgrIndex) ? (
                                          <div
                                            className="flex cursor-pointer items-center justify-between rounded-inset bg-[var(--control)] px-3.5 py-2.5 text-sm text-ink transition-colors hover:bg-[var(--control-hover)]"
                                            onClick={() => {
                                              setActiveDropdown(getMgrKey(desIndex, mgrIndex));
                                              setSearchQueries(prev => ({ ...prev, [getMgrKey(desIndex, mgrIndex)]: "" }));
                                            }}
                                          >
                                            <span className="truncate font-medium">{manager.departmentName}</span>
                                            <Search className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                                          </div>
                                        ) : (
                                          <div className="relative">
                                            <Input
                                              type="text"
                                              className="pr-9"
                                              placeholder="Search department..."
                                              autoFocus={activeDropdown === getMgrKey(desIndex, mgrIndex)}
                                              value={searchQueries[getMgrKey(desIndex, mgrIndex)] || ""}
                                              onChange={(e) => handleSearchChange(desIndex, mgrIndex, e.target.value)}
                                              onFocus={() => setActiveDropdown(getMgrKey(desIndex, mgrIndex))}
                                              onBlur={() => setTimeout(() => setActiveDropdown(null), 150)}
                                            />
                                            <Search className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                                            {activeDropdown === getMgrKey(desIndex, mgrIndex) && (
                                              <div className="frost-bar scroll-slim absolute top-full right-0 left-0 z-50 mt-1 max-h-44 overflow-y-auto rounded-inset border border-hairline">
                                                {getFilteredDepartments(desIndex, mgrIndex).length === 0 ? (
                                                  <p className="px-3 py-2 text-center text-xs text-ink-faint">No departments found</p>
                                                ) : (
                                                  getFilteredDepartments(desIndex, mgrIndex).map((dept) => (
                                                    <button
                                                      key={dept.id}
                                                      type="button"
                                                      className="w-full border-b border-hairline px-3 py-2 text-left text-sm transition-colors last:border-0 hover:bg-[var(--control)]"
                                                      onMouseDown={(e) => e.preventDefault()}
                                                      onClick={() => handleSelectDepartment(desIndex, mgrIndex, dept)}
                                                    >
                                                      <div className="font-medium text-ink">{dept.name}</div>
                                                      <div className="text-xs text-ink-faint">
                                                        <span data-figure>{dept.designations.length}</span> designations
                                                      </div>
                                                    </button>
                                                  ))
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Designation Selection */}
                                      {manager.departmentId && (
                                        <Field
                                          label="Designation"
                                          error={errors[`manager_${desIndex}_${mgrIndex}`]}
                                        >
                                          <Select
                                            value={
                                              manager.designationName || ""
                                            }
                                            onChange={(e) =>
                                              handleSelectDesignation(
                                                desIndex,
                                                mgrIndex,
                                                e.target.value,
                                              )
                                            }
                                            required
                                          >
                                            <option value="">
                                              Select designation
                                            </option>
                                            {designationDesignations[
                                              desIndex
                                            ]?.map((des) => (
                                              <option key={des} value={des}>
                                                {des}
                                              </option>
                                            ))}
                                          </Select>
                                        </Field>
                                      )}

                                      {/* Selected Manager Info */}
                                      {manager.departmentName &&
                                        manager.designationName && (
                                          <div className="mt-3 rounded-inset bg-[color-mix(in_srgb,var(--state-positive)_18%,transparent)] p-2.5 text-xs text-[var(--state-positive-ink)]">
                                            <div className="font-medium">
                                              ✓ {manager.departmentName}
                                            </div>
                                            <div className="opacity-85">
                                              {manager.designationName}
                                            </div>
                                          </div>
                                        )}
                                    </div>
                                  ),
                                )}
                              </div>
                            )}

                            {/* Add Manager Button */}
                            <Button
                              type="button"
                              tone="secondary"
                              size="sm"
                              onClick={() => handleAddManager(desIndex)}
                              className="w-full"
                            >
                              <Plus className="h-4 w-4" />
                              Add Manager
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Add Designation Button at Bottom */}
                <Button
                  type="button"
                  onClick={handleAddDesignation}
                  className="w-full"
                >
                  <Plus className="h-4 w-4" />
                  Add Another Designation
                </Button>
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}