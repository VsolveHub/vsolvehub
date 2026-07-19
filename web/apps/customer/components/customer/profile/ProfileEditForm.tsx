"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ProfileSubPage } from "./ProfileSubPage";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatPhone } from "@/lib/format";
import { useUpdateProfileMutation } from "@/lib/query/hooks";

type Props = {
  name: string;
  phone: string;
};

export function ProfileEditForm({ name, phone }: Props) {
  const router = useRouter();
  const [fullName, setFullName] = useState(name);
  const [error, setError] = useState("");
  const updateProfileMutation = useUpdateProfileMutation();
  const loading = updateProfileMutation.isPending;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    updateProfileMutation.mutate({ name: fullName.trim() }, {
      onSuccess: () => {
        router.push("/profile");
        router.refresh();
      },
      onError: (err: any) => {
        setError(err.message || "Could not save profile");
      }
    });
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
