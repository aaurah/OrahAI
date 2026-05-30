import React from "react";
import Link from "next/link";

interface WorkspaceTopbarProps {
  user?: { id: string; email: string; name?: string };
  workspaceName?: string;
}

const MAIN_ADMIN_EMAILS = [
  "aaurah@protonmail.com",
  "orahai@proton.me",
];

export const WorkspaceTopbar: React.FC<WorkspaceTopbarProps> = ({
  user,
  workspaceName,
}) => {
  const isMainAdmin = user && MAIN_ADMIN_EMAILS.includes(user.email);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0.75rem 1.5rem",
      borderBottom: "1px solid #eee",
      background: "#fafaff",
      fontWeight: 500,
      fontSize: "1rem",
      minHeight: "52px"
    }}>
      <div>
        {workspaceName ? (
          <span>{workspaceName}</span>
        ) : (
          <span>Workspace</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        {isMainAdmin && (
          <Link
            href="/dashboard/admin"
            style={{
              marginRight: "1rem",
              padding: "7px 18px",
              borderRadius: "8px",
              background: "#2d5cff",
              color: "#fff",
              fontWeight: 600,
              letterSpacing: "0.04em",
              textDecoration: "none"
            }}
          >
            Admin Panel
          </Link>
        )}
        {user && (
          <span style={{
            background: "#efefef",
            borderRadius: "1.5em",
            padding: "0.5em 1em",
            fontSize: "0.91em"
          }}>
            {user.email}
          </span>
        )}
      </div>
    </div>
  );
};

export default WorkspaceTopbar;
