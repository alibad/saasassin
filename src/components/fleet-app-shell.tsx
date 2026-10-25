"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Check,
  CircleDashed,
  Database,
  ExternalLink,
  GitBranch,
  LockKeyhole,
  Route,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FleetApp } from "@/types/fleet";

import styles from "./fleet-app-shell.module.css";

const stageLabels = {
  complete: "Working",
  next: "Build next",
  later: "Sequenced",
  blocked: "Waiting",
} as const;

const moduleIcons = [Database, Blocks, GitBranch, Route, ShieldCheck];

export function FleetAppShell({ app }: { app: FleetApp }) {
  const waiting = app.status === "Waiting upstream";
  const style = { "--fleet-accent": app.accent } as CSSProperties;

  return (
    <main className={`fleet-app ${styles.app}`} style={style}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link className={styles.brand} href="https://saasassin.net/apps" aria-label="Open the SaaSassin product fleet">
            <span className={styles.mark}><Image src="/brand/saasassin-mark.png" alt="" width={40} height={40} priority /></span>
            <span><strong>SaaSassin</strong><small>{app.productName}</small></span>
          </Link>
          <div className={styles.headerMeta}>
            <Badge variant={waiting ? "outline" : "secondary"}>{app.status}</Badge>
            <span>{app.subdomain}.saasassin.net</span>
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{app.category} / {app.strategy}</p>
            <h1>{app.promise}</h1>
            <p className={styles.lede}>{app.primaryJob}</p>
            <div className={styles.heroActions}>
              <Button asChild size="lg">
                <Link href={`/targets/${app.targetSlug}`}>
                  Open target decision <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="https://saasassin.net/apps">
                  <ArrowLeft /> Product fleet
                </Link>
              </Button>
            </div>
          </div>
          <Card className={styles.contractCard}>
            <CardHeader>
              <CardDescription>First end-to-end proof</CardDescription>
              <CardTitle>{waiting ? "Defined, intentionally paused" : "Demo contract"}</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{app.firstDemo}</p>
              <div className={styles.contractMeta}>
                <span><LockKeyhole /> Tenant boundary</span>
                <span><GitBranch /> Versioned state</span>
                <span><Database /> Portable records</span>
              </div>
            </CardContent>
          </Card>
        </section>

        {waiting ? (
          <aside className={styles.waitingBanner}>
            <CircleDashed />
            <div>
              <strong>Implementation is gated on upstream maintainer direction.</strong>
              <p>The product model and migration contract are ready. No disconnected Fider fork or greenfield feature work starts while the accepted contribution path is unresolved.</p>
            </div>
          </aside>
        ) : null}

        <Tabs defaultValue="overview" className={styles.tabs}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="model">Product model</TabsTrigger>
            <TabsTrigger value="delivery">Delivery</TabsTrigger>
            <TabsTrigger value="boundaries">Trust boundaries</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className={styles.panel}>
            <div className={styles.summaryGrid}>
              <Card>
                <CardHeader><CardDescription>Primary audience</CardDescription><CardTitle>{app.audience}</CardTitle></CardHeader>
              </Card>
              <Card>
                <CardHeader><CardDescription>Migration wedge</CardDescription><CardTitle>{app.migrationWedge}</CardTitle></CardHeader>
              </Card>
            </div>
            <section className={styles.workflow}>
              <div className={styles.sectionHeading}>
                <div><p className={styles.eyebrow}>Golden path</p><h2>The first workflow Claude must make real</h2></div>
                <Badge variant="outline">{app.workflow.length} verified steps</Badge>
              </div>
              <ol>
                {app.workflow.map((step, index) => (
                  <li key={step}><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong></li>
                ))}
              </ol>
            </section>
          </TabsContent>

          <TabsContent value="model" className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>Domain skeleton</p><h2>Modules and first-class records</h2></div>
              <p>These names establish ownership boundaries; they are not a claim that persistence is complete.</p>
            </div>
            <div className={styles.moduleGrid}>
              {app.modules.map((module, index) => {
                const Icon = moduleIcons[index % moduleIcons.length];
                return (
                  <Card key={module.name}>
                    <CardHeader>
                      <span className={styles.moduleIcon}><Icon /></span>
                      <CardTitle>{module.name}</CardTitle>
                      <CardDescription>{module.description}</CardDescription>
                    </CardHeader>
                    <CardContent className={styles.entityList}>
                      {module.entities.map((entity) => <Badge key={entity} variant="outline">{entity}</Badge>)}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="delivery" className={styles.panel}>
            <div className={styles.sectionHeading}>
              <div><p className={styles.eyebrow}>Vertical sequence</p><h2>Build one demonstrable loop at a time</h2></div>
              <Button asChild variant="outline"><Link href={`/targets/${app.targetSlug}`}>Research brief <ExternalLink /></Link></Button>
            </div>
            <div className={styles.stageList}>
              {app.stages.map((stage, index) => (
                <article key={stage.title} data-state={stage.state}>
                  <span className={styles.stageNumber}>{String(index + 1).padStart(2, "0")}</span>
                  <div><h3>{stage.title}</h3><p>{stage.outcome}</p></div>
                  <Badge variant={stage.state === "complete" ? "default" : "outline"}>{stageLabels[stage.state]}</Badge>
                </article>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="boundaries" className={styles.panel}>
            <div className={styles.boundaryGrid}>
              <Card>
                <CardHeader><CardDescription>Non-negotiable invariants</CardDescription><CardTitle>Trust contract</CardTitle></CardHeader>
                <CardContent><ul className={styles.checkList}>{app.invariants.map((item) => <li key={item}><Check />{item}</li>)}</ul></CardContent>
              </Card>
              <Card>
                <CardHeader><CardDescription>Explicit first-release exclusions</CardDescription><CardTitle>Scope guardrails</CardTitle></CardHeader>
                <CardContent><ul className={styles.exclusionList}>{app.exclusions.map((item) => <li key={item}>{item}</li>)}</ul></CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
