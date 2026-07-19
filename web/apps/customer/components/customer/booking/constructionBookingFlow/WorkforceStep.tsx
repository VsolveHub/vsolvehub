import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WORKER_ROLES, type WorkerRow } from "./model";
import { hireCardStyle, ScheduleFields, StepperRow } from "./shared";

type Props = {
  bookingType: "individual" | "team";
  individualRoleId: string;
  setIndividualRoleId: (id: string) => void;
  teamWorkers: WorkerRow[];
  setRowCount: (rowId: string, count: number) => void;
  removeRow: (rowId: string) => void;
  showAddRole: boolean;
  setShowAddRole: (val: boolean) => void;
  newRoleLabel: string;
  setNewRoleLabel: (val: string) => void;
  addCustomRole: () => void;
  startDate: string;
  setStartDate: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
};

export function WorkforceStep({
  bookingType,
  individualRoleId,
  setIndividualRoleId,
  teamWorkers,
  setRowCount,
  removeRow,
  showAddRole,
  setShowAddRole,
  newRoleLabel,
  setNewRoleLabel,
  addCustomRole,
  startDate,
  setStartDate,
  duration,
  setDuration,
}: Props) {
  if (bookingType === "individual") {
    return (
      <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <p style={{ fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>What kind of worker do you need?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {WORKER_ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`card address-card ${individualRoleId === r.id ? "selected" : ""}`}
              style={{ ...hireCardStyle, padding: "0.85rem 1rem" }}
              onClick={() => setIndividualRoleId(r.id)}
            >
              <input type="radio" checked={individualRoleId === r.id} readOnly />
              <span style={{ fontSize: "1.2rem" }}>{r.icon}</span>
              <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>{r.singular}</span>
                <span style={{ fontSize: "0.78rem", color: "#71717a" }}>₹{r.rate}/day</span>
              </div>
            </button>
          ))}
        </div>

        <ScheduleFields startDate={startDate} setStartDate={setStartDate} duration={duration} setDuration={setDuration} />
      </div>
    );
  }

  return (
    <div className="vsh-card stack" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p style={{ fontWeight: 700, fontSize: "0.9rem", margin: 0 }}>Select number of workers</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {teamWorkers.map((w) => (
          <StepperRow
            key={w.rowId}
            label={w.label}
            value={w.count}
            icon={w.icon}
            onChange={(v) => setRowCount(w.rowId, v)}
            onRemove={() => removeRow(w.rowId)}
          />
        ))}
        {teamWorkers.length === 0 && (
          <p style={{ fontSize: "0.8rem", color: "#a1a1aa", margin: 0 }}>No worker types yet — add one below.</p>
        )}
      </div>

      {showAddRole ? (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <Input
              label="Other worker type"
              placeholder="e.g. Painter, Plumber"
              value={newRoleLabel}
              onChange={(e) => setNewRoleLabel(e.target.value)}
            />
          </div>
          <Button onClick={addCustomRole} disabled={!newRoleLabel.trim()} style={{ height: "42px" }}>
            Add
          </Button>
          <Button variant="secondary" onClick={() => { setShowAddRole(false); setNewRoleLabel(""); }} style={{ height: "42px" }}>
            ✕
          </Button>
        </div>
      ) : (
        <button type="button" className="vsh-add-role-btn" onClick={() => setShowAddRole(true)}>
          + Add worker type
        </button>
      )}

      <ScheduleFields startDate={startDate} setStartDate={setStartDate} duration={duration} setDuration={setDuration} />
    </div>
  );
}
