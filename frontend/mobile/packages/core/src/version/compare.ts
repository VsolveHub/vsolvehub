/** Numeric dotted versions. `1.2.0` is below `1.2.10` and equal to `1.2`. */
export function compareVersions(left: string, right: string): number {
  const a = left.split(".").map((part) => Number(part));
  const b = right.split(".").map((part) => Number(part));
  const width = Math.max(a.length, b.length);
  for (let index = 0; index < width; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    if (!Number.isInteger(av) || !Number.isInteger(bv)) {
      throw new Error(`Invalid version ${left} or ${right}`);
    }
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

export function versionIsBelow(version: string, minimum: string): boolean {
  return compareVersions(version, minimum) < 0;
}
