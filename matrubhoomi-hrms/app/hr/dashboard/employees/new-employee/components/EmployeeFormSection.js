import { Panel, PanelHead } from "@/components/ceo/ui/Primitives";

export default function EmployeeFormSection({ title, children }) {
  return (
    <Panel label={title}>
      <PanelHead title={title} />
      {children}
    </Panel>
  );
}
