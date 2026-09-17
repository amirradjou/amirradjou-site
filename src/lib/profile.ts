/**
 * Loads and validates `content/profile.yaml` at build time.
 * The schema is deliberately strict: a typo in the YAML fails `pnpm build`
 * instead of silently rendering a half-empty page.
 */
import { parse } from "yaml";
import { z } from "astro/zod";
// Vite inlines the file at build time, so the YAML is read once and never shipped as a runtime read.
import profileYaml from "../../content/profile.yaml?raw";

const nonEmpty = z.string().trim().min(1);

const LinksSchema = z
  .object({
    github: z.url(),
    linkedin: z.url(),
    email: z.email(),
    cv: nonEmpty,
    website: z.url(),
    terminal: z.url(),
  })
  .strict();

const ExperienceSchema = z
  .object({
    company: nonEmpty,
    role: nonEmpty,
    location: nonEmpty,
    start: nonEmpty,
    end: nonEmpty,
    highlights: z.array(nonEmpty).min(1),
  })
  .strict();

const ProjectSchema = z
  .object({
    name: nonEmpty,
    kind: nonEmpty,
    url: z.url(),
    description: nonEmpty,
    fact: nonEmpty.optional(),
    tags: z.array(nonEmpty).min(1),
  })
  .strict();

const EducationSchema = z
  .object({
    degree: nonEmpty,
    school: nonEmpty,
    location: nonEmpty,
    start: nonEmpty,
    end: nonEmpty,
  })
  .strict();

export const ProfileSchema = z
  .object({
    name: nonEmpty,
    title: nonEmpty,
    location: nonEmpty,
    cv_date: nonEmpty,
    links: LinksSchema,
    summary: nonEmpty,
    experience: z.array(ExperienceSchema).min(1),
    projects: z.array(ProjectSchema).min(1),
    education: z.array(EducationSchema).min(1),
    skills: z.record(nonEmpty, z.array(nonEmpty).min(1)),
  })
  .strict();

export type Profile = z.infer<typeof ProfileSchema>;
export type Experience = Profile["experience"][number];
export type Project = Profile["projects"][number];
export type Education = Profile["education"][number];

export function loadProfile(): Profile {
  const raw: unknown = parse(profileYaml);
  const result = ProfileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`content/profile.yaml is invalid:\n${issues}`);
  }
  return result.data;
}

/** The current role, if any: the first entry whose end date is "Present". */
export function currentRole(profile: Profile): Experience | undefined {
  return profile.experience.find((job) => /^present$/i.test(job.end));
}

/** "Amirreza Radjou" -> { first: "Amirreza", last: "Radjou" } for OG profile tags. */
export function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/);
  return { first: parts[0] ?? name, last: parts.slice(1).join(" ") };
}
