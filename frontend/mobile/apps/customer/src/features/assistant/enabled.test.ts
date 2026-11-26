describe("ASSISTANT_ENABLED", () => {
  const original = process.env.EXPO_PUBLIC_ASSISTANT_ENABLED;
  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_ASSISTANT_ENABLED;
    else process.env.EXPO_PUBLIC_ASSISTANT_ENABLED = original;
    jest.resetModules();
  });

  function load(value: string | undefined) {
    if (value === undefined) delete process.env.EXPO_PUBLIC_ASSISTANT_ENABLED;
    else process.env.EXPO_PUBLIC_ASSISTANT_ENABLED = value;
    return (jest.requireActual("./enabled") as typeof import("./enabled")).ASSISTANT_ENABLED;
  }

  it("is on by default unless explicitly disabled with false", () => {
    expect(load(undefined)).toBe(true);
    jest.resetModules();
    expect(load("true")).toBe(true);
    jest.resetModules();
    expect(load("false")).toBe(false);
  });
});
