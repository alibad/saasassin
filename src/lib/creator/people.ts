import "server-only";

import { avatarDataUrl, loadProfiles, profileRef, sharesActiveTenant } from "@/lib/fleet/platform/profiles";
import { db, tenantRef } from "@/lib/fleet/platform/tenants";

import { CREATOR_SLUG } from "./model";

/**
 * People in Creator: names and profile photos for learners, teammates and instructors.
 *
 * Learners are not school members, so the shared avatar route (which only serves a photo to
 * people who share a workspace) would hide a learner's uploaded photo from the school that
 * teaches them. Creator therefore serves uploaded photos through its own route,
 * /api/creator/avatars/{uid}, with the visibility rule below. Provider photos (Google and so on)
 * are plain URLs and need no route.
 */

export type CreatorPerson = { name: string; title: string; photoURL: string | null };

const FLEET_AVATAR_PREFIX = `/api/fleet/${CREATOR_SLUG}/avatars/`;

/** Re-points an uploaded-photo URL at Creator's avatar route; leaves provider URLs alone. */
export function creatorPhotoURL(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith(FLEET_AVATAR_PREFIX) ? `/api/creator/avatars/${url.slice(FLEET_AVATAR_PREFIX.length)}` : url;
}

/** Display data for several people at once. People without a Creator profile are simply absent. */
export async function loadCreatorPeople(uids: string[]) {
  const profiles = await loadProfiles(CREATOR_SLUG, uids);
  const people = new Map<string, CreatorPerson>();
  for (const [uid, profile] of profiles) {
    people.set(uid, { name: profile.name, title: profile.title, photoURL: creatorPhotoURL(profile.photoURL) });
  }
  return people;
}

/** The same, as a plain object for JSON responses. */
export async function creatorPeopleRecord(uids: string[]) {
  return Object.fromEntries(await loadCreatorPeople(uids));
}

function learnerIndex(uid: string) {
  return db().collection("products").doc(CREATOR_SLUG).collection("learners").doc(uid).collection("enrollments");
}

function schoolsOf(uid: string) {
  return profileRef(CREATOR_SLUG, uid).collection("tenants").get();
}

async function activeMember(tenantId: string, uid: string) {
  const membership = await tenantRef(CREATOR_SLUG, tenantId).collection("memberships").doc(uid).get();
  return membership.exists && membership.get("status") === "active";
}

async function activeEnrollment(tenantId: string, courseId: string, uid: string) {
  const enrollment = await tenantRef(CREATOR_SLUG, tenantId).collection("enrollments").doc(`${courseId}_${uid}`).get();
  return enrollment.exists && enrollment.get("status") !== "revoked";
}

/**
 * Who may see someone's uploaded photo in Creator:
 * - teammates (they share an active school membership);
 * - a school's team, for people enrolled in one of that school's courses;
 * - a learner, for the team of a school they are actively enrolled in (their instructors);
 * - classmates: two people actively enrolled in the same course (lesson discussions).
 * Everyone else gets a 404 from the route.
 */
export async function canSeeCreatorPhoto(viewerUid: string, subjectUid: string) {
  if (await sharesActiveTenant(CREATOR_SLUG, viewerUid, subjectUid)) return true;

  const [viewerSchools, subjectSchools, viewerCourses, subjectCourses] = await Promise.all([
    schoolsOf(viewerUid),
    schoolsOf(subjectUid),
    learnerIndex(viewerUid).get(),
    learnerIndex(subjectUid).get(),
  ]);

  // The school's team sees its learners.
  const subjectTenants = new Set(subjectCourses.docs.map((doc) => String(doc.get("tenantId"))));
  for (const school of viewerSchools.docs) {
    if (subjectTenants.has(school.id) && (await activeMember(school.id, viewerUid))) {
      const learning = subjectCourses.docs.filter((doc) => doc.get("tenantId") === school.id);
      for (const doc of learning) {
        if (await activeEnrollment(school.id, String(doc.get("courseId")), subjectUid)) return true;
      }
    }
  }

  // Learners see the team of a school they are enrolled in.
  const subjectTeams = new Set(subjectSchools.docs.map((doc) => doc.id));
  for (const doc of viewerCourses.docs) {
    const tenantId = String(doc.get("tenantId"));
    if (!subjectTeams.has(tenantId)) continue;
    if ((await activeEnrollment(tenantId, String(doc.get("courseId")), viewerUid)) && (await activeMember(tenantId, subjectUid))) return true;
  }

  // Classmates.
  const subjectCourseKeys = new Set(subjectCourses.docs.map((doc) => doc.id));
  for (const doc of viewerCourses.docs) {
    if (!subjectCourseKeys.has(doc.id)) continue;
    const tenantId = String(doc.get("tenantId"));
    const courseId = String(doc.get("courseId"));
    if ((await activeEnrollment(tenantId, courseId, viewerUid)) && (await activeEnrollment(tenantId, courseId, subjectUid))) return true;
  }
  return false;
}

/**
 * The instructor shown on a public course page: whoever created the course, if they are still on
 * the school's team. An uploaded photo is inlined, because visitors are not signed in.
 */
export async function courseInstructor(tenantId: string, createdBy: string) {
  if (!createdBy || !(await activeMember(tenantId, createdBy))) return null;
  const profile = (await loadProfiles(CREATOR_SLUG, [createdBy])).get(createdBy);
  if (!profile?.name) return null;
  const photoURL = profile.photoURL?.startsWith(FLEET_AVATAR_PREFIX) ? await avatarDataUrl(CREATOR_SLUG, createdBy) : profile.photoURL;
  return { uid: createdBy, name: profile.name, title: profile.title, photoURL };
}
