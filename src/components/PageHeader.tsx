import { Breadcrumbs } from "./Breadcrumbs";
import "./PageHeader.css";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  /** Set false on pages where the trail would be noise. */
  showBreadcrumbs?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  action,
  showBreadcrumbs = true,
}: PageHeaderProps) {
  return (
    <div className="page-header-wrap">
      {showBreadcrumbs && <Breadcrumbs />}
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {action}
      </header>
    </div>
  );
}
