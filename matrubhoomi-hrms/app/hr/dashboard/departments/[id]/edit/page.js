import DepartmentFormPage from "@/components/department/DepartmentFormPage";

export default async function EditDepartmentPage({ params }) {
  // Await the params to get the id
  const { id } = await params;

  return <DepartmentFormPage isEditing={true} departmentId={id} />;
}
