import type { ReactNode } from "react";

interface EmptyStateProps {
  action?: ReactNode;
  actionClassName?: string;
  children?: ReactNode;
  className?: string;
  description: string;
  details?: readonly string[];
  eyebrow?: string;
  icon: ReactNode;
  layout?: "page" | "compact";
  role?: "status";
  title: string;
  tone?: "default" | "error" | "pending";
}

export function EmptyState({
  action,
  actionClassName,
  children,
  className,
  description,
  details,
  eyebrow,
  icon,
  layout = "page",
  role,
  title,
  tone = "default",
}: Readonly<EmptyStateProps>) {
  return (
    <div className={["empty-state", className].filter(Boolean).join(" ")} data-layout={layout} data-tone={tone} role={role}>
      <div className="empty-state__main">
        <span aria-hidden="true" className="empty-state__icon">{icon}</span>
        <div className="empty-state__copy">
          {eyebrow && tone !== "default" && <span className="empty-state__eyebrow">{eyebrow}</span>}
          <h3 className="empty-state__title">{title}</h3>
          <p className="empty-state__description">{description}</p>
        </div>
        {action && (
          <div className={["empty-state__actions", actionClassName].filter(Boolean).join(" ")}>{action}</div>
        )}
        {details && details.length > 0 && (
          <ul className="empty-state__notes">
            {details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        )}
      </div>
      {children && <div className="empty-state__secondary">{children}</div>}
    </div>
  );
}
