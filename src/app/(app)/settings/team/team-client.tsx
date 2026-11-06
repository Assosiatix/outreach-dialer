"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { Button, Label } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { addMember, setMemberActive, updateMember, type Msg } from "../actions";

function Result({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return <p className={`text-[13px] ${msg.error ? "text-coral-ink" : "text-[oklch(0.42_0.11_158)]"}`}>{msg.error ?? msg.ok}</p>;
}

export function AddMemberForm() {
  const [state, action, pending] = useActionState(addMember, undefined);
  return (
    <form action={action} className="space-y-3 px-5 py-4">
      <div>
        <Label htmlFor="m-name">Name</Label>
        <input id="m-name" name="name" required className="field" />
      </div>
      <div>
        <Label htmlFor="m-email">Email</Label>
        <input id="m-email" name="email" type="email" required className="field" />
      </div>
      <div>
        <Label htmlFor="m-pass" hint="min 10 characters">
          Password
        </Label>
        <input id="m-pass" name="password" type="text" required minLength={10} className="field" autoComplete="off" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="m-role">Role</Label>
          <select id="m-role" name="role" className="field" defaultValue="caller">
            <option value="caller">Caller</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div>
          <Label htmlFor="m-alert">Alert phone</Label>
          <input id="m-alert" name="alertPhone" placeholder="+92 300…" className="field" />
        </div>
      </div>
      <Result msg={state} />
      <Button size="sm" disabled={pending}>
        Add member
      </Button>
    </form>
  );
}

type M = { id: string; name: string; email: string; role: "admin" | "caller"; alertPhone: string; active: boolean };

export function MemberRow({ member, badge, isMe }: { member: M; badge: ReactNode; isMe: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateMember.bind(null, member.id), undefined);
  const [toggling, start] = useTransition();

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {member.name} {isMe && <span className="font-normal text-ash">(you)</span>}
          </p>
          <p className="text-[13px] text-ash">
            {member.email} · {member.role === "admin" ? "Admin" : "Caller"}
            {member.alertPhone && ` · alerts to ${formatPhone(member.alertPhone)}`}
          </p>
        </div>
        {badge}
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? "Close" : "Edit"}
        </Button>
        {!isMe && (
          <Button size="sm" variant="ghost" disabled={toggling} onClick={() => start(() => setMemberActive(member.id, !member.active))}>
            {member.active ? "Deactivate" : "Reactivate"}
          </Button>
        )}
      </div>
      {editing && (
        <form action={action} className="mt-3 grid gap-3 rounded-xl bg-surface p-4 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <input name="name" defaultValue={member.name} className="field" />
          </div>
          <div>
            <Label>Role</Label>
            <select name="role" defaultValue={member.role} className="field">
              <option value="caller">Caller</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <Label>Alert phone</Label>
            <input name="alertPhone" defaultValue={member.alertPhone} placeholder="+92 300…" className="field" />
          </div>
          <div>
            <Label hint="leave empty to keep">New password</Label>
            <input name="password" type="text" autoComplete="off" className="field" />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button size="sm" disabled={pending}>
              Save
            </Button>
            <Result msg={state} />
          </div>
        </form>
      )}
    </li>
  );
}
