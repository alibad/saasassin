import "server-only";

import missionsSeed from "@/data/missions.json";
import roadmapSeed from "@/data/roadmap.json";
import targetsSeed from "@/data/targets.json";
import { getAdminDb } from "@/lib/firebase/admin";
import type { Mission, RoadmapItem, Target } from "@/types/catalog";

type DataSource = "firestore" | "seed";

export type CatalogSnapshot = {
  items: Target[];
  source: DataSource;
};

export type RoadmapSnapshot = {
  items: RoadmapItem[];
  source: DataSource;
};

export type MissionsSnapshot = {
  items: Mission[];
  source: DataSource;
};

const seededTargets = targetsSeed as Target[];
const seededRoadmap = roadmapSeed as RoadmapItem[];
const seededMissions = missionsSeed as Mission[];

function withoutFirestoreMetadata<T>(data: FirebaseFirestore.DocumentData): T {
  const item = { ...data };
  delete item.updatedAt;
  return item as T;
}

export async function getCatalogSnapshot(): Promise<CatalogSnapshot> {
  const db = getAdminDb();
  if (!db) {
    return { items: seededTargets, source: "seed" };
  }

  try {
    const snapshot = await db.collection("targets").orderBy("rank", "asc").get();
    if (snapshot.empty) {
      return { items: seededTargets, source: "seed" };
    }

    return {
      items: snapshot.docs.map((document) =>
        withoutFirestoreMetadata<Target>(document.data()),
      ),
      source: "firestore",
    };
  } catch (error) {
    console.warn("Firestore catalog read failed; using seed data.", error);
    return { items: seededTargets, source: "seed" };
  }
}

export async function getRoadmapSnapshot(): Promise<RoadmapSnapshot> {
  const db = getAdminDb();
  if (!db) {
    return { items: seededRoadmap, source: "seed" };
  }

  try {
    const snapshot = await db.collection("roadmap").orderBy("order", "asc").get();
    if (snapshot.empty) {
      return { items: seededRoadmap, source: "seed" };
    }

    return {
      items: snapshot.docs.map((document) =>
        withoutFirestoreMetadata<RoadmapItem>(document.data()),
      ),
      source: "firestore",
    };
  } catch (error) {
    console.warn("Firestore roadmap read failed; using seed data.", error);
    return { items: seededRoadmap, source: "seed" };
  }
}

export async function getMissionsSnapshot(): Promise<MissionsSnapshot> {
  const db = getAdminDb();
  if (!db) {
    return { items: seededMissions, source: "seed" };
  }

  try {
    const snapshot = await db.collection("missions").orderBy("startedAt", "asc").get();
    if (snapshot.empty) {
      return { items: seededMissions, source: "seed" };
    }

    return {
      items: snapshot.docs.map((document) =>
        withoutFirestoreMetadata<Mission>(document.data()),
      ),
      source: "firestore",
    };
  } catch (error) {
    console.warn("Firestore mission read failed; using seed data.", error);
    return { items: seededMissions, source: "seed" };
  }
}

export async function getMissionBySlug(slug: string) {
  const { items } = await getMissionsSnapshot();
  return items.find((mission) => mission.slug === slug) ?? null;
}

export async function getTargetBySlug(slug: string) {
  const { items } = await getCatalogSnapshot();
  return items.find((target) => target.slug === slug) ?? null;
}

export function getSeededTargetSlugs() {
  return seededTargets.map((target) => ({ slug: target.slug }));
}
