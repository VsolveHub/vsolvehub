type Props = {
  otp: string[];
  error: string;
  onOtpChange: (index: number, val: string) => void;
};

export function OtpEntry({ otp, error, onOtpChange }: Props) {
  return (
    <div style={{ background: "#fdf4ff", border: "1px solid #f5d0fe", padding: "1rem", borderRadius: "12px", textAlign: "center" }}>
      <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "#6d28d9", margin: "0 0 0.25rem 0" }}>Enter Verification OTP</p>
      <p style={{ fontSize: "0.75rem", color: "#666", margin: "0 0 0.75rem 0" }}>Enter the completion code sent to your phone</p>

      <div style={{ display: "flex", gap: "0.375rem", justifyContent: "center" }}>
        {otp.map((digit, idx) => (
          <input
            key={idx}
            id={`otp-input-${idx}`}
            type="text"
            maxLength={1}
            value={digit}
            onChange={(e) => onOtpChange(idx, e.target.value)}
            style={{ width: "38px", height: "38px", textAlign: "center", fontSize: "1.1rem", fontWeight: 800, border: "1.5px solid #d4d4d8", borderRadius: "8px", background: "white" }}
          />
        ))}
      </div>
      {error && <p style={{ color: "red", fontSize: "0.75rem", margin: "0.375rem 0 0 0" }}>{error}</p>}
      <p style={{ fontSize: "0.7rem", color: "#888", margin: "0.5rem 0 0 0" }}>Hint: Use code 2 8 4 7</p>
    </div>
  );
}
