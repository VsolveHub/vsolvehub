"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ProfileSubPage } from "./ProfileSubPage";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatPhone } from "@/lib/format";

type Props = {
  name: string;
  phone: string;
};

export function ProfileEditForm({ name, phone }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fullName.trim() }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Could not save profile");
      return;
    }

    router.push("/profile");
    router.refresh();
  }

  return (
    <ProfileSubPage title="Edit profile">
      <form className="profile-panel stack" onSubmit={onSubmit}>
        <Input
          id="profile-name"
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
        />
        <Input
          id="profile-phone"
          label="Mobile number"
          value={formatPhone(phone)}
          readOnly
          aria-describedby="profile-phone-hint"
        />
        <p id="profile-phone-hint" className="text-sm text-muted">
          Phone number is tied to your login and cannot be changed here.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <Button type="submit" loading={loading} disabled={loading || !fullName.trim()}>
          Save changes
        </Button>
      </form>
    </ProfileSubPage>
  );
}
