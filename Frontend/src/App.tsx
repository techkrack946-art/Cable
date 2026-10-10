import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
// @ts-ignore The API module is intentionally kept as the requested JavaScript service.
import { createCustomer, deleteCustomer, getCustomers, getExpiryDashboard, getSettings, rechargeCustomer, updateCustomer, updateSettings } from "./services/api";

type Page = "Dashboard" | "Customers" | "Recharges" | "SMS" | "Settings";
type CustomerFilter = "all" | "active" | "expiring" | "expired";
type Modal = "customer" | "recharge" | null;
type CustomerStatus = "Active" | "Expiring" | "Expired";
type NotificationStatus = { threeDay: boolean; twoDay: boolean; oneDay: boolean };

type Customer = {
  _id: string;
  name: string;
  phone: string;
  stbNumber: string;
  plan: string;
  amount: number;
  rechargeDate: string;
  expiryDate: string;
  notificationStatus: NotificationStatus;
};

type ExpiryDashboard = {
  threeDays: Customer[];
  twoDays: Customer[];
  oneDay: Customer[];
  expired: Customer[];
};

const emptyExpiryDashboard: ExpiryDashboard = { threeDays: [], twoDays: [], oneDay: [], expired: [] };
const dismissedNotificationStorageKey = "cableconnect.dismissed-notifications";

const navItems: { label: Page; icon: IconName }[] = [
  { label: "Dashboard", icon: "grid" },
  { label: "Customers", icon: "users" },
  { label: "Recharges", icon: "refresh" },
  { label: "SMS", icon: "message" },
  { label: "Settings", icon: "settings" },
];

type IconName = "grid" | "users" | "refresh" | "message" | "settings" | "search" | "plus" | "bell" | "chevron" | "close" | "calendar" | "tv" | "arrow" | "edit" | "trash" | "eye" | "save" | "userPlus" | "x";

const iconPaths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  refresh: <><path d="M20 7h-6V1" /><path d="M20.49 11A9 9 0 1 0 21 15" /><path d="m20 1-7 7" /></>,
  message: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15 1.7 1.7 0 0 0 3.08 14H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-1.55V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M13.7 21h-3.4" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  close: <><path d="m18 6-12 12M6 6l12 12" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  tv: <><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="m8 2 4 3 4-3M8 22h8" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
  trash: <><path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6" /></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
  save: <><path d="M5 3h12l2 2v16H5Z" /><path d="M8 3v6h8V3M8 21v-6h8v6" /></>,
  userPlus: <><path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M19 8v6M16 11h6" /></>,
  x: <><path d="m18 6-12 12M6 6l12 12" /></>,
};

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

function Button({ children, variant = "primary", icon, onClick, type = "button", disabled = false }: { children: ReactNode; variant?: "primary" | "secondary" | "ghost"; icon?: IconName; onClick?: () => void; type?: "button" | "submit"; disabled?: boolean }) {
  return <button type={type} className={`button button-${variant}`} onClick={onClick} disabled={disabled}>{icon && <Icon name={icon} size={17} />}{children}</button>;
}

function StatusBadge({ status }: { status: string }) {
  const color = ["Active", "Sent"].includes(status) ? (status === "Sent" ? "blue" : "green") : ["Expiring", "Scheduled"].includes(status) ? "orange" : "red";
  return <span className={`badge badge-${color}`}><span className="badge-dot" />{status}</span>;
}

function PageHeading({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">Cable operations</p><h1>{title}</h1><p>{subtitle}</p></div>{children && <div className="heading-actions">{children}</div>}</div>;
}

function EmptyTableScroll({ children }: { children: ReactNode }) {
  return <div className="table-scroll">{children}</div>;
}

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
}

function inputDate(value?: string) {
  return value ? value.slice(0, 10) : "";
}

function todayInputDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function dayNumberInIndia(value: Date | string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
}

function daysUntil(value: string) {
  return Math.round((dayNumberInIndia(value) - dayNumberInIndia(new Date())) / (24 * 60 * 60 * 1000));
}

function customerStatus(customer: Customer): CustomerStatus {
  const days = daysUntil(customer.expiryDate);
  return days <= 0 ? "Expired" : days <= 7 ? "Expiring" : "Active";
}

function smsStatus(customer: Customer) {
  const sent = customer.notificationStatus?.threeDay || customer.notificationStatus?.twoDay || customer.notificationStatus?.oneDay;
  return sent ? "Sent" : daysUntil(customer.expiryDate) > 0 && daysUntil(customer.expiryDate) <= 3 ? "Scheduled" : "Failed";
}

function ErrorNotice({ message }: { message: string }) {
  return <div className="notice"><div className="notice-icon"><Icon name="bell" size={20} /></div><div><strong>Something went wrong</strong><p>{message}</p></div></div>;
}

type NotificationPanelProps = {
  expiryDashboard: ExpiryDashboard;
  loading: boolean;
  onNavigate: (page: Page) => void;
  onClose: () => void;
  dismissedIds: Set<string>;
  onDismiss: (id: string) => void;
};

type Notification = { id: string; label: string; customer: Customer; color: string };

function notificationId(customer: Customer, category: string) {
  return `${customer._id}:${category}:${inputDate(customer.expiryDate)}`;
}

function getNotificationIds(expiryDashboard: ExpiryDashboard) {
  return [
    ...expiryDashboard.threeDays.map((customer) => notificationId(customer, "threeDays")),
    ...expiryDashboard.twoDays.map((customer) => notificationId(customer, "twoDays")),
    ...expiryDashboard.oneDay.map((customer) => notificationId(customer, "oneDay")),
    ...expiryDashboard.expired.map((customer) => notificationId(customer, "expired")),
  ];
}

function NotificationPanel({ expiryDashboard, loading, onNavigate, onClose, dismissedIds, onDismiss }: NotificationPanelProps) {
  const groups = [
    { label: "Expiring in 3 days", category: "threeDays", customers: expiryDashboard.threeDays, color: "orange" },
    { label: "Expiring in 2 days", category: "twoDays", customers: expiryDashboard.twoDays, color: "orange" },
    { label: "Expiring tomorrow", category: "oneDay", customers: expiryDashboard.oneDay, color: "orange" },
    { label: "Expired subscriptions", category: "expired", customers: expiryDashboard.expired, color: "red" },
  ];
  const notifications: Notification[] = groups.flatMap((group) => group.customers.map((customer) => ({ id: notificationId(customer, group.category), label: group.label, customer, color: group.color }))).filter(({ id }) => !dismissedIds.has(id));

  return <div className="notification-panel" role="dialog" aria-label="Notifications">
    <div className="dropdown-heading"><div><strong>Notifications</strong><span>{loading ? "Checking expiry data..." : `${notifications.length} active alerts`}</span></div><button className="icon-button dropdown-close" onClick={onClose} aria-label="Close notifications"><Icon name="close" size={16} /></button></div>
    {loading ? <p className="dropdown-empty">Loading expiry notifications...</p> : !notifications.length ? <p className="dropdown-empty">You're all caught up.</p> : <div className="notification-list">{notifications.map(({ id, customer, label, color }) => <div className="notification-item" key={id} role="button" tabIndex={0} onClick={() => { onNavigate("Customers"); onClose(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onNavigate("Customers"); onClose(); } }}><span className={`notification-dot ${color}`} /><span className="notification-copy"><strong>{customer.name}</strong><small>{label} · {formatDate(customer.expiryDate)}</small></span><Icon name="arrow" size={14} /><button className="notification-dismiss" title="Dismiss notification" aria-label={`Dismiss notification for ${customer.name}`} onClick={(event) => { event.stopPropagation(); onDismiss(id); }}><Icon name="trash" size={14} /></button></div>)}</div>}
  </div>;
}

function ProfileMenu({ onNavigate, onClose }: { onNavigate: (page: Page) => void; onClose: () => void }) {
  return <div className="profile-menu" role="menu" aria-label="Administrator profile"><div className="profile-summary"><div className="top-avatar">AD</div><div><strong>Administrator</strong><span>Village Cable Network</span></div></div><button role="menuitem" onClick={() => { onNavigate("Settings"); onClose(); }}><Icon name="settings" size={16} /> Open Settings</button></div>;
}

function Dashboard({ customers, expiryDashboard, loading, onNavigate, onRecharge }: { customers: Customer[]; expiryDashboard: ExpiryDashboard; loading: boolean; onNavigate: (page: Page, filter?: CustomerFilter) => void; onRecharge: (customer?: Customer) => void }) {
  const expiring = [
    ...expiryDashboard.threeDays.map((customer) => ({ customer, daysLeft: 3 })),
    ...expiryDashboard.twoDays.map((customer) => ({ customer, daysLeft: 2 })),
    ...expiryDashboard.oneDay.map((customer) => ({ customer, daysLeft: 1 })),
  ];
  const cards: { label: string; value: number; note: string; color: string; icon: IconName; filter: CustomerFilter }[] = [
    { label: "Total Customers", value: customers.length, note: "All registered connections", color: "blue", icon: "users", filter: "all" },
    { label: "Active", value: customers.filter((customer) => customerStatus(customer) === "Active").length, note: "Currently active plans", color: "green", icon: "tv", filter: "active" },
    { label: "Expiring Soon", value: expiring.length, note: "Within the next 3 days", color: "orange", icon: "calendar", filter: "expiring" },
    { label: "Expired", value: expiryDashboard.expired.length, note: "Needs follow-up", color: "red", icon: "refresh", filter: "expired" },
  ];
  return <>
    <PageHeading title="Dashboard" subtitle="Here’s what’s happening with your cable connections today."><Button icon="plus" onClick={() => onRecharge()}>New Recharge</Button></PageHeading>
    <div className="summary-grid">{cards.map((card) => <button className="summary-card" key={card.label} onClick={() => onNavigate("Customers", card.filter)} aria-label={`View ${card.label}`}><div className={`metric-icon metric-${card.color}`}><Icon name={card.icon} size={20} /></div><div className="metric-content"><p>{card.label}</p><strong>{loading ? "..." : card.value}</strong><span>{card.note}</span></div></button>)}</div>
    <section className="panel">
      <div className="panel-heading"><div><h2>Customers Expiring Soon</h2><p>Upcoming expiries that may need a reminder</p></div><button className="text-button" onClick={() => onNavigate("Customers")}>View all <Icon name="arrow" size={16} /></button></div>
      <EmptyTableScroll><table><thead><tr><th>Customer</th><th>Mobile</th><th>Plan</th><th>Expiry Date</th><th>Days Left</th><th>SMS</th><th>Action</th></tr></thead><tbody>
        {loading && <tr><td colSpan={7}>Loading customers...</td></tr>}
        {!loading && expiring.map(({ customer, daysLeft }) => <tr key={customer._id}><td><div className="customer-cell"><span className="avatar">{customer.name.split(" ").map((name) => name[0]).join("")}</span><strong>{customer.name}</strong></div></td><td>{customer.phone}</td><td>{customer.plan}</td><td>{formatDate(customer.expiryDate)}</td><td><span className="days">{daysLeft} days</span></td><td><StatusBadge status={smsStatus(customer)} /></td><td><button className="row-action" onClick={() => onRecharge(customer)}><Icon name="refresh" size={13} /> Recharge</button></td></tr>)}
        {!loading && !expiring.length && <tr><td colSpan={7}>No customers are expiring in the next 3 days.</td></tr>}
      </tbody></table></EmptyTableScroll>
    </section>
  </>;
}

function Customers({ customers, expiryDashboard, filter, loading, deletingCustomerId, onAdd, onEdit, onRecharge, onDelete }: { customers: Customer[]; expiryDashboard: ExpiryDashboard; filter: CustomerFilter; loading: boolean; deletingCustomerId?: string; onAdd: () => void; onEdit: (customer: Customer) => void; onRecharge: (customer: Customer) => void; onDelete: (customer: Customer) => void }) {
  const [query, setQuery] = useState("");
  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    if (filter === "active") return customerStatus(customer) === "Active";
    if (filter === "expired") {
      const expiredIds = new Set(expiryDashboard.expired.map((item) => item._id));
      return expiredIds.has(customer._id);
    }
    if (filter === "expiring") {
      const expiringIds = new Set([...expiryDashboard.threeDays, ...expiryDashboard.twoDays, ...expiryDashboard.oneDay].map((item) => item._id));
      return expiringIds.has(customer._id);
    }
    return true;
  }), [customers, expiryDashboard, filter]);
  const results = useMemo(() => filteredCustomers.filter((customer) => `${customer.name} ${customer.phone} ${customer.stbNumber}`.toLowerCase().includes(query.toLowerCase())), [filteredCustomers, query]);
  const filterLabel = filter === "all" ? "" : ` · ${filter[0].toUpperCase()}${filter.slice(1)}`;
  return <>
    <PageHeading title="Customers" subtitle="Manage customer details, plans, and connection status."><Button icon="plus" onClick={onAdd}>Add Customer</Button></PageHeading>
    <section className="panel"><div className="toolbar"><label className="search-box"><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, mobile, or STB number" /></label><span className="record-count">{loading ? "Loading..." : `${results.length} customers shown${filterLabel}`}</span></div>
      <EmptyTableScroll><table><thead><tr><th>Name</th><th>Mobile</th><th>STB Number</th><th>Plan</th><th>Expiry Date</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {loading && <tr><td colSpan={7}>Loading customers...</td></tr>}
        {!loading && results.map((customer) => <tr key={customer._id}><td><div className="customer-cell"><span className="avatar">{customer.name.split(" ").map((name) => name[0]).join("")}</span><strong>{customer.name}</strong></div></td><td>{customer.phone}</td><td><span className="mono">{customer.stbNumber}</span></td><td>{customer.plan}</td><td>{formatDate(customer.expiryDate)}</td><td><StatusBadge status={customerStatus(customer)} /></td><td><div className="action-group"><button className="row-action muted" onClick={() => onEdit(customer)}><Icon name="edit" size={13} /> Edit</button><button className="row-action" onClick={() => onRecharge(customer)}><Icon name="refresh" size={13} /> Recharge</button><button className="row-action danger" onClick={() => onDelete(customer)} disabled={deletingCustomerId === customer._id}><Icon name="trash" size={13} /> {deletingCustomerId === customer._id ? "Deleting..." : "Delete"}</button></div></td></tr>)}
        {!loading && !results.length && <tr><td colSpan={7}>No customers found.</td></tr>}
      </tbody></table></EmptyTableScroll>
    </section>
  </>;
}

function Recharges({ customers, loading, onRecharge }: { customers: Customer[]; loading: boolean; onRecharge: (customer?: Customer) => void }) {
  return <><PageHeading title="Recharges" subtitle="Review and record customer recharge activity."><Button icon="plus" onClick={() => onRecharge()}>New Recharge</Button></PageHeading><div className="notice"><div className="notice-icon"><Icon name="refresh" size={20} /></div><div><strong>Record keeping only</strong><p>Recharges saved here update expiry tracking. No online payment is processed.</p></div></div><section className="panel"><div className="panel-heading"><div><h2>Customer Recharge Details</h2><p>Current recharge dates and expiry tracking</p></div></div><EmptyTableScroll><table><thead><tr><th>Customer</th><th>Plan</th><th>Amount</th><th>Recharge Date</th><th>New Expiry</th><th>Action</th></tr></thead><tbody>
    {loading && <tr><td colSpan={6}>Loading customers...</td></tr>}
    {!loading && customers.map((customer) => <tr key={customer._id}><td><strong>{customer.name}</strong></td><td>{customer.plan}</td><td className="amount">₹{customer.amount}.00</td><td>{formatDate(customer.rechargeDate)}</td><td>{formatDate(customer.expiryDate)}</td><td><button className="row-action" onClick={() => onRecharge(customer)}><Icon name="refresh" size={13} /> Recharge</button></td></tr>)}
    {!loading && !customers.length && <tr><td colSpan={6}>No customer recharge data available.</td></tr>}
  </tbody></table></EmptyTableScroll></section></>;
}

function SmsHistory({ customers }: { customers: Customer[] }) {
  const sentCount = customers.reduce((total, customer) => total + Number(customer.notificationStatus?.threeDay) + Number(customer.notificationStatus?.twoDay) + Number(customer.notificationStatus?.oneDay), 0);
  const reminders = customers.flatMap((customer) => [
    customer.notificationStatus?.threeDay && { customer, reminder: "3-day reminder" },
    customer.notificationStatus?.twoDay && { customer, reminder: "2-day reminder" },
    customer.notificationStatus?.oneDay && { customer, reminder: "1-day reminder" },
  ].filter(Boolean) as { customer: Customer; reminder: string }[]);
  return <><PageHeading title="SMS History" subtitle="Track automatic reminders sent to your customers." /><div className="sms-summary"><div><span className="status-orb blue" /><p><strong>{sentCount}</strong> Sent reminders</p></div><div><span className="status-orb orange" /><p><strong>0</strong> Scheduled</p></div><div><span className="status-orb red" /><p><strong>0</strong> Failed</p></div></div><section className="panel"><div className="panel-heading"><div><h2>Reminder History</h2><p>Reminder status from customer records</p></div></div><EmptyTableScroll><table><thead><tr><th>Customer</th><th>Mobile</th><th>Reminder</th><th>Date</th><th>Status</th></tr></thead><tbody>
    {reminders.map(({ customer, reminder }) => <tr key={`${customer._id}-${reminder}`}><td><strong>{customer.name}</strong></td><td>{customer.phone}</td><td>{reminder}</td><td>{formatDate(customer.rechargeDate)}</td><td><StatusBadge status="Sent" /></td></tr>)}
    {!reminders.length && <tr><td colSpan={5}>No sent reminders recorded.</td></tr>}
  </tbody></table></EmptyTableScroll></section></>;
}

type SmsTemplates = { threeDay: string; twoDay: string; oneDay: string };
type AdminDetails = { businessName: string; contactNumber: string; villageArea: string };
const defaultAdminDetails: AdminDetails = { businessName: "CableConnect", contactNumber: "", villageArea: "Village Cable Network" };
const defaultSmsTemplates: SmsTemplates = {
  threeDay: "Dear {name}, your cable TV recharge will expire in 3 days on {expiryDate}. Please recharge to continue your service.",
  twoDay: "Dear {name}, your cable TV recharge will expire in 2 days on {expiryDate}. Please recharge to continue your service.",
  oneDay: "Dear {name}, your cable TV recharge will expire tomorrow on {expiryDate}. Please recharge to continue your service.",
};
const templateLabels: { key: keyof SmsTemplates; label: string }[] = [
  { key: "threeDay", label: "3-day reminder" },
  { key: "twoDay", label: "2-day reminder" },
  { key: "oneDay", label: "1-day reminder" },
];

function Settings() {
  const [enabled, setEnabled] = useState(true);
  const [templates, setTemplates] = useState<SmsTemplates>(defaultSmsTemplates);
  const [adminDetails, setAdminDetails] = useState<AdminDetails>(defaultAdminDetails);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string }>();

  useEffect(() => {
    getSettings().then((data: { smsTemplates: SmsTemplates; adminDetails?: AdminDetails }) => {
      setTemplates({ ...defaultSmsTemplates, ...data.smsTemplates });
      setAdminDetails({ ...defaultAdminDetails, ...data.adminDetails });
    })
      .catch((error: Error) => setFeedback({ type: "error", message: error.message || "Unable to load SMS templates." }))
      .finally(() => setLoading(false));
  }, []);

  const updateTemplate = (key: keyof SmsTemplates, value: string) => setTemplates((current) => ({ ...current, [key]: value }));
  const updateAdminDetail = (key: keyof AdminDetails, value: string) => setAdminDetails((current) => ({ ...current, [key]: value }));
  const validateTemplates = () => {
    const supported = new Set(["name", "expiryDate", "daysLeft"]);
    for (const { key, label } of templateLabels) {
      if (!templates[key].trim()) return `${label} cannot be empty.`;
      const placeholders = [...templates[key].matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]);
      const unsupported = placeholders.find((placeholder) => !supported.has(placeholder));
      if (unsupported) return `${label} contains unsupported placeholder: {${unsupported}}.`;
    }
    return "";
  };
  const saveTemplates = async () => {
    const validationError = validateTemplates();
    if (validationError) {
      setFeedback({ type: "error", message: validationError });
      return;
    }
    setSaving(true);
    setFeedback(undefined);
    try {
      const data = await updateSettings({ smsTemplates: templates });
      setTemplates(data.smsTemplates);
      setFeedback({ type: "success", message: "SMS templates saved successfully." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to save SMS templates." });
    } finally {
      setSaving(false);
    }
  };
  const saveAdminDetails = async () => {
    if (!adminDetails.businessName.trim() || !adminDetails.villageArea.trim()) {
      setFeedback({ type: "error", message: "Business name and village / area are required." });
      return;
    }
    setSaving(true);
    setFeedback(undefined);
    try {
      const data = await updateSettings({ adminDetails });
      setAdminDetails({ ...defaultAdminDetails, ...data.adminDetails });
      setFeedback({ type: "success", message: "Admin details saved successfully." });
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to save admin details." });
    } finally {
      setSaving(false);
    }
  };
  const restoreDefaults = () => {
    if (window.confirm("Restore all SMS templates to their default messages?")) {
      setTemplates(defaultSmsTemplates);
      setFeedback({ type: "success", message: "Defaults restored locally. Save Settings to persist them." });
    }
  };
  const preview = templates.threeDay.replace(/\{name\}/g, "Ravi Kumar").replace(/\{expiryDate\}/g, "12-10-2026").replace(/\{daysLeft\}/g, "3");
  return <><PageHeading title="Settings" subtitle="Configure business details and reminder preferences." />
    <div className="settings-grid"><section className="panel settings-card"><div className="panel-heading"><div><h2>Business Details</h2><p>Shown in your admin records</p></div></div><div className="form-grid single"><label className="field"><span>Business Name</span><input value={adminDetails.businessName} onChange={(event) => updateAdminDetail("businessName", event.target.value)} /></label><label className="field"><span>Contact Number</span><input value={adminDetails.contactNumber} onChange={(event) => updateAdminDetail("contactNumber", event.target.value)} /></label><label className="field"><span>Village / Area</span><input value={adminDetails.villageArea} onChange={(event) => updateAdminDetail("villageArea", event.target.value)} /></label><Button icon="save" onClick={saveAdminDetails} disabled={loading || saving}>{saving ? "Saving..." : "Save Details"}</Button>{feedback && <p className={`feedback feedback-${feedback.type}`}>{feedback.message}</p>}</div></section>
      <section className="panel settings-card"><div className="panel-heading"><div><h2>SMS Reminders</h2><p>Automatic expiry notifications</p></div></div><div className="setting-row"><div><strong>Automatic reminders</strong><p>Send reminders before a plan expires</p></div><button aria-label="Toggle reminders" onClick={() => setEnabled(!enabled)} className={`toggle ${enabled ? "on" : ""}`}><span /></button></div><div className="form-grid single compact"><Field label="Reminder schedule" defaultValue="3, 2, and 1 day before expiry" /></div></section></div>
    <section className="panel settings-card sms-templates"><div className="panel-heading"><div><h2>SMS Templates</h2><p>Global messages used by automatic TextBee reminders</p></div></div>
      <div className="template-body">{loading ? <p className="loading-state">Loading templates...</p> : templateLabels.map(({ key, label }) => <label className="field field-wide" key={key}><span>{label}</span><textarea value={templates[key]} onChange={(event) => updateTemplate(key, event.target.value)} rows={3} /></label>)}
        <p className="helper-text">Supported placeholders: <code>{"{name}"}</code>, <code>{"{expiryDate}"}</code>, and <code>{"{daysLeft}"}</code>.</p>
        <div className="preview-box"><strong>Message preview</strong><p>{preview}</p></div>
        {feedback && <p className={`feedback feedback-${feedback.type}`}>{feedback.message}</p>}
        <div className="settings-actions"><Button variant="secondary" icon="refresh" onClick={restoreDefaults} disabled={loading || saving}>Restore Defaults</Button><Button icon="save" onClick={saveTemplates} disabled={loading || saving}>{saving ? "Saving..." : "Save Settings"}</Button></div>
      </div>
    </section>
  </>;
}

function Field({ label, name, defaultValue, type = "text", as = "input", required = false }: { label: string; name?: string; defaultValue?: string; type?: string; as?: "input" | "textarea" | "select"; required?: boolean }) {
  const [dateValue, setDateValue] = useState(defaultValue || "");
  return <label className={`field ${as === "textarea" ? "field-wide" : ""}`}><span>{label}</span>{as === "textarea" ? <textarea name={name} defaultValue={defaultValue} rows={3} required={required} /> : as === "select" ? <select name={name} defaultValue={defaultValue} required={required}><option>Basic</option><option>Family</option><option>Premium</option><option>Monthly</option></select> : <><input name={name} type={type} defaultValue={defaultValue} onChange={type === "date" ? (event) => setDateValue(event.target.value) : undefined} required={required} />{type === "date" && dateValue && <small className="date-helper">Selected: {formatDate(dateValue)}</small>}</>}</label>;
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><div className="modal-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><Icon name="close" /></button></div>{children}</div></div>;
}

function CustomerModal({ customer, onClose, onSaved }: { customer?: Customer; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const data = { name: values.name, phone: values.phone, stbNumber: values.stbNumber, plan: values.plan, amount: Number(values.amount), rechargeDate: values.rechargeDate };
    try {
      if (customer) await updateCustomer(customer._id, data);
      else await createCustomer(data);
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save customer.");
    } finally {
      setSaving(false);
    }
  };
  return <ModalShell title={customer ? "Edit Customer" : "Add Customer"} subtitle={customer ? "Update customer connection details." : "Create a new cable TV customer record."} onClose={onClose}><form onSubmit={submit}><div className="form-grid"><Field label="Customer Name" name="name" defaultValue={customer?.name} required /><Field label="Mobile Number" name="phone" defaultValue={customer?.phone} required /><Field label="STB Number" name="stbNumber" defaultValue={customer?.stbNumber} required /><Field label="Plan" name="plan" as="select" defaultValue={customer?.plan || "Basic"} required /><Field label="Recharge Amount" name="amount" type="number" defaultValue={customer ? String(customer.amount) : ""} required /><Field label="Recharge Date" name="rechargeDate" type="date" defaultValue={inputDate(customer?.rechargeDate) || todayInputDate()} required /></div>{error && <p className="field-error">{error}</p>}  <div className="modal-footer"><Button variant="secondary" icon="x" onClick={onClose}>Cancel</Button><Button type="submit" icon={customer ? "save" : "userPlus"} disabled={saving}>{saving ? "Saving..." : customer ? "Save Customer" : "Add Customer"}</Button></div></form></ModalShell>;
}

function RechargeModal({ customer, customers, onClose, onSaved }: { customer?: Customer; customers: Customer[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await rechargeCustomer(String(values.customerId), { amount: Number(values.amount), rechargeDate: values.rechargeDate });
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to record recharge.");
    } finally {
      setSaving(false);
    }
  };
  return <ModalShell title="Record Recharge" subtitle="This records a recharge only. No payment will be processed." onClose={onClose}><form onSubmit={submit}><div className="form-grid single"><label className="field"><span>Customer</span><select name="customerId" defaultValue={customer?._id || customers[0]?._id || ""} required><option value="" disabled>Select a customer</option>{customers.map((item) => <option value={item._id} key={item._id}>{item.name} - {item.stbNumber}</option>)}</select></label><Field label="Amount" name="amount" type="number" defaultValue={customer ? String(customer.amount) : ""} required /><Field label="Recharge Date" name="rechargeDate" type="date" defaultValue={todayInputDate()} required /></div>{error && <p className="field-error">{error}</p>}<div className="modal-footer"><Button variant="secondary" icon="x" onClick={onClose}>Cancel</Button><Button type="submit" icon="save" disabled={saving || !customers.length}>{saving ? "Processing..." : "Save Recharge"}</Button></div></form></ModalShell>;
}

export default function App() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>("all");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileSource, setProfileSource] = useState<"sidebar" | "top">("top");
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(() => {
    try {
      const saved = window.localStorage.getItem(dismissedNotificationStorageKey);
      return new Set(saved ? JSON.parse(saved) : []);
    } catch {
      return new Set();
    }
  });
  const [modal, setModal] = useState<Modal>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer>();
  const [rechargeCustomer, setRechargeCustomer] = useState<Customer>();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expiryDashboard, setExpiryDashboard] = useState<ExpiryDashboard>(emptyExpiryDashboard);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingCustomerId, setDeletingCustomerId] = useState<string>();
  const notificationDesktopRef = useRef<HTMLDivElement>(null);
  const notificationMobileRef = useRef<HTMLDivElement>(null);
  const profileSidebarRef = useRef<HTMLDivElement>(null);
  const profileDesktopRef = useRef<HTMLDivElement>(null);

  const refreshData = async () => {
    setLoading(true);
    setError("");
    try {
      const [customerData, expiryData] = await Promise.all([getCustomers(), getExpiryDashboard()]);
      setCustomers(customerData);
      setExpiryDashboard(expiryData);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Unable to load backend data.";
      setError(message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData().catch(() => undefined);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(dismissedNotificationStorageKey, JSON.stringify([...dismissedNotificationIds]));
    } catch {
      setError("Unable to save dismissed notifications in this browser.");
    }
  }, [dismissedNotificationIds]);

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!notificationDesktopRef.current?.contains(target) && !notificationMobileRef.current?.contains(target)) setNotificationsOpen(false);
      if (!profileSidebarRef.current?.contains(target) && !profileDesktopRef.current?.contains(target)) setProfileOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNotificationsOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleDelete = async (customer: Customer) => {
    if (!window.confirm(`Delete ${customer.name}?`)) return;
    setDeletingCustomerId(customer._id);
    try {
      await deleteCustomer(customer._id);
      await refreshData();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to delete customer.");
    } finally {
      setDeletingCustomerId(undefined);
    }
  };

  const openCustomer = (customer?: Customer) => { setEditingCustomer(customer); setModal("customer"); };
  const openRecharge = (customer?: Customer) => { setRechargeCustomer(customer); setModal("recharge"); };

  const notificationCount = getNotificationIds(expiryDashboard).filter((id) => !dismissedNotificationIds.has(id)).length;
  const dismissNotification = (id: string) => {
    setDismissedNotificationIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };
  const navigate = (nextPage: Page, filter: CustomerFilter = "all") => {
    setPage(nextPage);
    setCustomerFilter(filter);
    setNotificationsOpen(false);
    setProfileOpen(false);
  };
  const toggleProfile = (source: "sidebar" | "top") => {
    setProfileSource(source);
    setProfileOpen((open) => profileSource === source ? !open : true);
  };

  return <div className="app-shell">
    <aside className="sidebar"><button className="brand brand-link" onClick={() => navigate("Dashboard")} aria-label="Go to Dashboard"><span className="brand-mark"><Icon name="tv" size={23} /></span><div><strong>CableConnect</strong><span>Village Cable Network</span></div></button><nav>{navItems.map((item) => <button key={item.label} className={page === item.label ? "active" : ""} onClick={() => navigate(item.label)}><Icon name={item.icon} size={19} />{item.label}{page === item.label && <span className="nav-indicator" />}</button>)}</nav><div className="sidebar-foot" ref={profileSidebarRef}><button className="profile-trigger" onClick={() => toggleProfile("sidebar")} aria-expanded={profileOpen && profileSource === "sidebar"} aria-label="Open administrator profile"><div className="admin-avatar">AD</div><div><strong>Administrator</strong><span>Village Cable Network</span></div><Icon name="chevron" size={16} /></button>{profileOpen && profileSource === "sidebar" && <ProfileMenu onNavigate={navigate} onClose={() => setProfileOpen(false)} />}</div></aside>
    <div className="mobile-header"><button className="brand brand-link" onClick={() => navigate("Dashboard")} aria-label="Go to Dashboard"><span className="brand-mark"><Icon name="tv" size={20} /></span><div><strong>CableConnect</strong><span>Village Cable Network</span></div></button><div className="header-popover" ref={notificationMobileRef}><button className="icon-button has-dot" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label={`Open notifications${notificationCount ? `, ${notificationCount} alerts` : ""}`} aria-expanded={notificationsOpen}><Icon name="bell" size={20} />{notificationCount > 0 && <span className="notification-count">{notificationCount}</span>}</button>{notificationsOpen && <NotificationPanel expiryDashboard={expiryDashboard} loading={loading} onNavigate={navigate} onClose={() => setNotificationsOpen(false)} dismissedIds={dismissedNotificationIds} onDismiss={dismissNotification} />}</div></div>
    <div className="mobile-nav">{navItems.map((item) => <button key={item.label} className={page === item.label ? "active" : ""} onClick={() => setPage(item.label)}><Icon name={item.icon} size={18} /><span>{item.label}</span></button>)}</div>
    <main><header className="topbar"><div className="topbar-date"><button className="header-brand" onClick={() => navigate("Dashboard")} aria-label="Go to Dashboard"><span className="brand-mark"><Icon name="tv" size={18} /></span><span><strong>CableConnect</strong><small>Village Cable Network</small></span></button><span>{formatDate(new Date().toISOString())}</span></div><div className="topbar-actions"><div className="header-popover" ref={notificationDesktopRef}><button className="icon-button has-dot" onClick={() => setNotificationsOpen(!notificationsOpen)} aria-label={`Open notifications${notificationCount ? `, ${notificationCount} alerts` : ""}`} aria-expanded={notificationsOpen}><Icon name="bell" size={20} />{notificationCount > 0 && <span className="notification-count">{notificationCount}</span>}</button>{notificationsOpen && <NotificationPanel expiryDashboard={expiryDashboard} loading={loading} onNavigate={navigate} onClose={() => setNotificationsOpen(false)} dismissedIds={dismissedNotificationIds} onDismiss={dismissNotification} />}</div><div className="header-popover" ref={profileDesktopRef}><button className="top-avatar profile-trigger-button" onClick={() => toggleProfile("top")} aria-label="Open administrator profile" aria-expanded={profileOpen && profileSource === "top"}>AD</button>{profileOpen && profileSource === "top" && <ProfileMenu onNavigate={navigate} onClose={() => setProfileOpen(false)} />}</div></div></header><div className="content">{error && <ErrorNotice message={error} />}{page === "Dashboard" && <Dashboard customers={customers} expiryDashboard={expiryDashboard} loading={loading} onNavigate={navigate} onRecharge={openRecharge} />}{page === "Customers" && <Customers customers={customers} expiryDashboard={expiryDashboard} filter={customerFilter} loading={loading} deletingCustomerId={deletingCustomerId} onAdd={() => openCustomer()} onEdit={openCustomer} onRecharge={openRecharge} onDelete={handleDelete} />}{page === "Recharges" && <Recharges customers={customers} loading={loading} onRecharge={openRecharge} />}{page === "SMS" && <SmsHistory customers={customers} />}{page === "Settings" && <Settings />}</div></main>
    {modal === "customer" && <CustomerModal customer={editingCustomer} onClose={() => setModal(null)} onSaved={refreshData} />}
    {modal === "recharge" && <RechargeModal customer={rechargeCustomer} customers={customers} onClose={() => setModal(null)} onSaved={refreshData} />}
  </div>;
}
