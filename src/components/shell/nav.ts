import type { Role } from "@/lib/constants";

export type NavItem = { href: string; label: string; icon: string };
export type NavGroup = { title: string; items: NavItem[] };

export const NAV: Record<Role, NavGroup[]> = {
  student: [
    {
      title: "Main",
      items: [
        { href: "/student/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/student/attendance", label: "My Attendance", icon: "attendance" },
        { href: "/student/marks", label: "My Marks", icon: "marks" },
      ],
    },
    {
      title: "NOC",
      items: [
        { href: "/student/noc/apply", label: "Apply for NOC", icon: "noc-apply" },
        { href: "/student/noc/status", label: "NOC Status", icon: "noc-status" },
      ],
    },
    { title: "Account", items: [{ href: "/student/profile", label: "My Profile", icon: "profile" }] },
  ],
  teacher: [
    {
      title: "Main",
      items: [
        { href: "/teacher/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/teacher/marks/upload", label: "Upload Marks", icon: "upload" },
        { href: "/teacher/marks/history", label: "Marks History", icon: "history" },
        { href: "/teacher/attendance", label: "Attendance Report", icon: "reports" },
      ],
    },
  ],
  hod: [
    {
      title: "Main",
      items: [
        { href: "/hod/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/hod/sections", label: "Sections", icon: "sections" },
      ],
    },
    {
      title: "Attendance",
      items: [
        { href: "/hod/attendance/upload", label: "Upload Attendance", icon: "upload" },
        { href: "/hod/attendance/reports", label: "Attendance Reports", icon: "reports" },
      ],
    },
    { title: "Marks", items: [{ href: "/hod/marks", label: "Marks Management", icon: "marks" }, { href: "/hod/marks/upload", label: "Upload Marks", icon: "upload" }] },
    {
      title: "NOC",
      items: [
        { href: "/hod/noc/requests", label: "NOC Requests", icon: "noc-status" },
        { href: "/hod/noc/settings", label: "NOC Settings", icon: "settings" },
      ],
    },
  ],
  admin: [
    {
      title: "Main",
      items: [
        { href: "/admin/dashboard", label: "Dashboard", icon: "dashboard" },
        { href: "/admin/users", label: "Manage Users", icon: "users" },
        { href: "/admin/academics", label: "Courses & Subjects", icon: "academics" },
        { href: "/admin/sections", label: "Sections", icon: "sections" },
        { href: "/admin/audit-logs", label: "Audit Logs", icon: "audit" },
      ],
    },
  ],
};
