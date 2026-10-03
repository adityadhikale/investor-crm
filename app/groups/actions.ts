"use server";

import { revalidatePath } from "next/cache";

import { requireActionAuth } from "@/lib/auth";
import {
  normalizeGroupMembers,
  type GroupContactRelation,
} from "@/lib/group-members";
import { fetchAllPages } from "@/lib/supabase-pagination";
import { ilikeAnyFilter } from "@/lib/postgrest-filter";

function validateName(value: string) {
  const name = value.trim();
  if (!name) return "Group name is required.";
  if (name.length > 100) return "Group name must be 100 characters or fewer.";
  return null;
}

async function hasDuplicateName(
  supabase: NonNullable<Awaited<ReturnType<typeof requireActionAuth>>["supabase"]>,
  name: string,
  excludeId?: string,
) {
  let query = supabase.from("groups").select("id").ilike("name", name).limit(1);

  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query.maybeSingle();
  return { duplicate: Boolean(data), error };
}

const EMPTY_GROUP_ERROR = "A group must have at least one member.";

async function countActiveMembers(
  supabase: NonNullable<Awaited<ReturnType<typeof requireActionAuth>>["supabase"]>,
  groupId: string,
) {
  const { count, error } = await supabase
    .from("contact_groups")
    .select("contact_id, contacts!inner(id)", { count: "exact", head: true })
    .eq("group_id", groupId)
    .is("contacts.deleted_at", null);

  return { count: count ?? 0, error };
}

export async function addGroup(name: string, contactIds: string[]) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const trimmedName = String(name ?? "").trim();
  const validationError = validateName(trimmedName);
  if (validationError) return { error: validationError };

  const normalizedContactIds = [
    ...new Set((contactIds ?? []).filter((id) => typeof id === "string" && id.trim())),
  ];
  if (!normalizedContactIds.length) {
    return { error: `${EMPTY_GROUP_ERROR} Select at least one contact.` };
  }

  const duplicateCheck = await hasDuplicateName(supabase, trimmedName);
  if (duplicateCheck.error) return { error: "The group could not be checked for duplicates." };
  if (duplicateCheck.duplicate) return { error: "A group with this name already exists." };

  // Check the contacts exist before creating anything, so a stale selection
  // never leaves a half-made group behind.
  const foundIds = new Set<string>();
  for (let i = 0; i < normalizedContactIds.length; i += 100) {
    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id")
      .is("deleted_at", null)
      .in("id", normalizedContactIds.slice(i, i + 100));

    if (contactsError) return { error: "The selected contacts could not be checked." };
    (contacts ?? []).forEach((contact) => foundIds.add(contact.id as string));
  }
  if (foundIds.size !== normalizedContactIds.length) {
    return { error: "One or more selected contacts could not be found." };
  }

  const { data: group, error } = await supabase
    .from("groups")
    .insert({ name: trimmedName })
    .select("id")
    .single();
  if (error || !group) return { error: "The group could not be created." };

  for (let i = 0; i < normalizedContactIds.length; i += 500) {
    const { error: membersError } = await supabase.from("contact_groups").insert(
      normalizedContactIds
        .slice(i, i + 500)
        .map((contactId) => ({ contact_id: contactId, group_id: group.id })),
    );

    if (membersError) {
      // Roll back so an empty or partial group is never left behind.
      await supabase.from("contact_groups").delete().eq("group_id", group.id);
      await supabase.from("groups").delete().eq("id", group.id);
      return { error: "The group could not be created with those contacts." };
    }
  }

  revalidatePath("/groups");
  revalidatePath("/contacts");
  return { success: true };
}

export async function updateGroup(id: string, formData: FormData) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const name = String(formData.get("name") ?? "").trim();
  const validationError = validateName(name);
  if (validationError) return { error: validationError };

  const duplicateCheck = await hasDuplicateName(supabase, name, id);
  if (duplicateCheck.error) return { error: "The group could not be checked for duplicates." };
  if (duplicateCheck.duplicate) return { error: "A group with this name already exists." };

  const { error } = await supabase.from("groups").update({ name }).eq("id", id);
  if (error) return { error: "The group could not be updated." };

  revalidatePath("/groups");
  revalidatePath("/contacts");
  return { success: true };
}

export async function deleteGroup(id: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const { error: relationError } = await supabase
    .from("contact_groups")
    .delete()
    .eq("group_id", id);

  if (relationError) return { error: "The group could not be deleted." };

  const { error } = await supabase.from("groups").delete().eq("id", id);
  if (error) return { error: "The group could not be deleted." };

  revalidatePath("/groups");
  revalidatePath("/contacts");
  return { success: true };
}

export async function removeContactFromGroup(groupId: string, contactId: string) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  if (!groupId.trim() || !contactId.trim()) {
    return { error: "The group membership could not be found." };
  }

  const [{ data: group, error: groupError }, { data: contact, error: contactError }] =
    await Promise.all([
      supabase.from("groups").select("id").eq("id", groupId).maybeSingle(),
      supabase.from("contacts").select("id").eq("id", contactId).maybeSingle(),
    ]);

  if (groupError || contactError || !group || !contact) {
    return { error: "The group membership could not be found." };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("contact_groups")
    .select("contact_id")
    .eq("group_id", groupId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (membershipError) return { error: "The group membership could not be checked." };
  if (!membership) return { error: "This contact is not in the group." };

  const members = await countActiveMembers(supabase, groupId);
  if (members.error) return { error: "The group members could not be counted." };
  if (members.count <= 1) {
    return {
      error: `${EMPTY_GROUP_ERROR} Add another contact first, or delete the group.`,
    };
  }

  const { error } = await supabase
    .from("contact_groups")
    .delete()
    .eq("group_id", groupId)
    .eq("contact_id", contactId);

  if (error) return { error: "The contact could not be removed from the group." };

  revalidatePath("/groups");
  revalidatePath("/contacts");
  return { success: true };
}

export async function removeContactsFromGroup(groupId: string, contactIds: string[]) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedContactIds = [
    ...new Set(contactIds.filter((id) => typeof id === "string" && id.trim())),
  ];

  if (!groupId.trim()) return { error: "The group could not be found." };
  if (!normalizedContactIds.length) return { error: "No contacts were selected." };
  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError || !group) return { error: "The group could not be found." };

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id")
    .in("id", normalizedContactIds);

  if (contactsError || contacts?.length !== normalizedContactIds.length) {
    return { error: "One or more selected contacts could not be found." };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("contact_groups")
    .select("contact_id")
    .eq("group_id", groupId)
    .in("contact_id", normalizedContactIds);

  if (membershipError) return { error: "The group memberships could not be checked." };

  const memberIds = [...new Set((memberships ?? []).map((membership) => membership.contact_id))];
  if (!memberIds.length) return { error: "The selected contacts are not in this group." };

  const members = await countActiveMembers(supabase, groupId);
  if (members.error) return { error: "The group members could not be counted." };
  if (members.count - memberIds.length < 1) {
    return {
      error: `${EMPTY_GROUP_ERROR} Keep at least one contact, or delete the group.`,
    };
  }

  const { error } = await supabase
    .from("contact_groups")
    .delete()
    .eq("group_id", groupId)
    .in("contact_id", memberIds);

  if (error) return { error: "The contacts could not be removed from the group." };

  revalidatePath("/groups");
  revalidatePath("/contacts");
  return { success: true, removed: memberIds.length };
}

export async function deleteGroups(ids: string[]) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const groupIds = [
    ...new Set(ids.filter((id) => typeof id === "string" && id.trim())),
  ];

  if (!groupIds.length) {
    return { error: "No groups were selected." };
  }

  const { data: existingGroups, error: lookupError } = await supabase
    .from("groups")
    .select("id")
    .in("id", groupIds);

  if (lookupError || existingGroups?.length !== groupIds.length) {
    return { error: "The selected groups could not be found." };
  }

  const { error: relationError } = await supabase
    .from("contact_groups")
    .delete()
    .in("group_id", groupIds);

  if (relationError) {
    return { error: "The selected groups could not be deleted." };
  }

  const { error } = await supabase.from("groups").delete().in("id", groupIds);
  if (error) {
    return { error: "The selected groups could not be deleted." };
  }

  revalidatePath("/groups");
  revalidatePath("/contacts");
  return { success: true, deleted: groupIds.length };
}

export type GroupContactOption = {
  id: string;
  name: string;
  phone: string;
};

export async function getGroupContactOptions(groupId: string, search = "") {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  if (!groupId.trim()) return { error: "The group could not be found." };

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError || !group) return { error: "The group could not be found." };

  const { data: memberships, error: membershipError } = await supabase
    .from("contact_groups")
    .select("contact_id")
    .eq("group_id", groupId);

  if (membershipError) return { error: "Contacts could not be loaded." };

  const trimmedSearch = search.trim();

  let contacts: GroupContactOption[];
  try {
    contacts = await fetchAllPages<GroupContactOption>((from, to) => {
      let query = supabase.from("contacts").select("id, name, phone").is("deleted_at", null);
      if (trimmedSearch) {
        query = query.or(
          ilikeAnyFilter(["name", "phone"], trimmedSearch),
        );
      }
      return query.order("name", { ascending: true }).range(from, to);
    });
  } catch {
    return { error: "Contacts could not be loaded." };
  }

  const memberIds = new Set((memberships ?? []).map((membership) => membership.contact_id));
  return {
    contacts: contacts.filter((contact) => !memberIds.has(contact.id)),
    totalContacts: contacts.length,
  };
}

const NEW_GROUP_CONTACT_LIMIT = 100;

/**
 * Contacts to pick from when creating a group. Capped (and searchable) rather
 * than loading every contact, which keeps the sheet fast with thousands of rows.
 */
export async function searchContactsForNewGroup(search = "") {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const trimmedSearch = search.trim();

  let query = supabase.from("contacts").select("id, name, phone").is("deleted_at", null);
  if (trimmedSearch) {
    query = query.or(ilikeAnyFilter(["name", "phone"], trimmedSearch));
  }

  const { data, error } = await query
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .limit(NEW_GROUP_CONTACT_LIMIT + 1);

  if (error) return { error: "Contacts could not be loaded." };

  const rows = (data ?? []) as GroupContactOption[];
  return {
    contacts: rows.slice(0, NEW_GROUP_CONTACT_LIMIT),
    hasMore: rows.length > NEW_GROUP_CONTACT_LIMIT,
  };
}

export async function addContactsToGroup(groupId: string, contactIds: string[]) {
  const { supabase, error: authError } = await requireActionAuth();
  if (authError || !supabase) return { error: "Unauthorized" };

  const normalizedContactIds = [
    ...new Set(contactIds.filter((id) => typeof id === "string" && id.trim())),
  ];

  if (!groupId.trim()) return { error: "The group could not be found." };
  if (!normalizedContactIds.length) return { error: "No contacts were selected." };

  const { data: group, error: groupError } = await supabase
    .from("groups")
    .select("id")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError || !group) return { error: "The group could not be found." };

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("id")
    .in("id", normalizedContactIds);

  if (contactsError || contacts?.length !== normalizedContactIds.length) {
    return { error: "One or more selected contacts could not be found." };
  }

  const { data: existingMemberships, error: membershipError } = await supabase
    .from("contact_groups")
    .select("contact_id")
    .eq("group_id", groupId)
    .in("contact_id", normalizedContactIds);

  if (membershipError) return { error: "The group memberships could not be checked." };

  const existingIds = new Set(
    (existingMemberships ?? []).map((membership) => membership.contact_id),
  );
  const newContactIds = normalizedContactIds.filter((id) => !existingIds.has(id));

  if (newContactIds.length) {
    const { error: insertError } = await supabase.from("contact_groups").insert(
      newContactIds.map((contactId) => ({ contact_id: contactId, group_id: groupId })),
    );

    if (insertError) return { error: "The contacts could not be added to the group." };
  }

  const { data: updatedGroup, error: updatedGroupError } = await supabase
    .from("groups")
    .select("id, name, created_at, contact_groups(contact_id, contacts(id, name, phone))")
    .eq("id", groupId)
    .single();

  if (updatedGroupError || !updatedGroup) {
    return { error: "The group members could not be refreshed." };
  }

  revalidatePath("/groups");
  revalidatePath("/contacts");
  return {
    success: true,
    added: newContactIds.length,
    already: existingIds.size,
    contactGroups: normalizeGroupMembers(
      updatedGroup.contact_groups as GroupContactRelation[],
    ),
  };
}