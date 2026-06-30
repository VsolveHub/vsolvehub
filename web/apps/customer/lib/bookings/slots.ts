export function generateTimeSlots(days = 7) {
  const slots: { label: string; value: string }[] = [];
  const now = new Date();

  for (let day = 0; day < days; day++) {
    for (const hour of [9, 11, 14, 16, 18]) {
      const d = new Date(now);
      d.setDate(d.getDate() + day);
      d.setHours(hour, 0, 0, 0);
      if (d <= now) continue;
      slots.push({
        label: d.toLocaleString("en-IN", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
        value: d.toISOString(),
      });
    }
  }

  return slots;
}

export function getInstantSlot() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 45);
  d.setSeconds(0, 0);
  return d.toISOString();
}

export function getDateOptions(days = 14) {
  const options: { label: string; value: string }[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    options.push({
      label: d.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      value: d.toISOString().slice(0, 10),
    });
  }

  return options;
}

export function getTimeOptionsForDate(dateValue: string) {
  const slots = generateTimeSlots(14);
  return slots.filter((s) => s.value.startsWith(dateValue));
}

export function buildScheduledSlot(dateValue: string, timeValue: string) {
  const date = new Date(dateValue);
  const time = new Date(timeValue);
  date.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return date.toISOString();
}
