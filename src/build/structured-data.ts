// JSON-LD builders for every page type. Pure functions of (data, siteUrl, today)
// so they can be unit-tested without touching the filesystem or a renderer.
// The shared envelope, breadcrumb and site-level nodes live in jsonld.ts.

import type { ChangeEntry } from "../data/changelog.js";
import { modelFullLabel, providerLabel } from "../data/display.js";
import type { ModelFaq } from "../data/faq.js";
import { SITE_DESCRIPTION, SITE_NAME } from "../data/site.js";
import { lifecycle } from "../data/status.js";
import {
  ABOUT_PATH,
  absolute,
  CALENDAR_PATH,
  CHANGELOG_PATH,
  modelJsonPath,
  modelPagePath,
  providerPagePath,
} from "../data/urls.js";
import type { Model } from "../schema/model.js";
import { breadcrumb, graph, homeWebsiteNode, organizationNode, type Crumb } from "./jsonld.js";

function homeDatasetNode(siteUrl: string, imageUrl: string, today: string) {
  return {
    "@type": "Dataset",
    "@id": `${siteUrl}/#dataset`,
    name: `${SITE_NAME} catalog`,
    description: SITE_DESCRIPTION,
    url: `${siteUrl}/`,
    image: imageUrl,
    license: "https://opensource.org/licenses/MIT",
    isAccessibleForFree: true,
    dateModified: today,
    keywords: ["AI model deprecation", "model shutdown date", "LLM migration", "model retirement"],
    creator: { "@id": `${siteUrl}/#org` },
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: `${siteUrl}/api/v1/models.json`,
    },
  };
}

function homeItemListNode(models: Model[], siteUrl: string, today: string) {
  return {
    "@type": "ItemList",
    name: `${SITE_NAME} catalog`,
    description: SITE_DESCRIPTION,
    numberOfItems: models.length,
    itemListElement: models.map((model, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absolute(siteUrl, modelPagePath(model)),
      name: `${modelFullLabel(model)} — ${lifecycle(model, today).status}`,
    })),
  };
}

export function buildHomeStructuredData(
  models: Model[],
  siteUrl: string,
  imageUrl: string,
  today: string,
): string {
  return graph([
    organizationNode(siteUrl),
    homeWebsiteNode(siteUrl),
    homeDatasetNode(siteUrl, imageUrl, today),
    homeItemListNode(models, siteUrl, today),
  ]);
}

function faqPageNode(faqs: ModelFaq[], model: Model, siteUrl: string) {
  return {
    "@type": "FAQPage",
    "@id": `${siteUrl}${modelPagePath(model)}#faq`,
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}

/**
 * A model page is a Dataset (the lifecycle record) plus a breadcrumb plus the
 * FAQ. `citation` carries the provider docs the dates come from, which is the
 * machine-readable half of the trust claim the page makes in prose.
 */
export function buildModelStructuredData(
  model: Model,
  description: string,
  siteUrl: string,
  faqs: ModelFaq[],
  today: string,
): string {
  const life = lifecycle(model, today);
  const dataset = {
    "@type": "Dataset",
    "@id": `${siteUrl}${modelPagePath(model)}#dataset`,
    name: `${modelFullLabel(model)} deprecation status`,
    description,
    url: absolute(siteUrl, modelPagePath(model)),
    isPartOf: { "@id": `${siteUrl}/#dataset` },
    license: "https://opensource.org/licenses/MIT",
    isAccessibleForFree: true,
    dateModified: model.last_verified,
    creator: { "@type": "Organization", name: SITE_NAME, url: `${siteUrl}/` },
    distribution: {
      "@type": "DataDownload",
      encodingFormat: "application/json",
      contentUrl: absolute(siteUrl, modelJsonPath(model)),
    },
    citation: model.sources.map((source) => ({
      "@type": "CreativeWork",
      name: source.title ?? source.url,
      url: source.url,
    })),
    variableMeasured: [
      { "@type": "PropertyValue", name: "status", value: life.status },
      ...(model.deprecated_on
        ? [{ "@type": "PropertyValue", name: "deprecated_on", value: model.deprecated_on }]
        : []),
      ...(life.shutdown
        ? [
            {
              "@type": "PropertyValue",
              name: life.soft ? "earliest_shutdown_on" : "shutdown_on",
              value: life.shutdown,
            },
          ]
        : []),
    ],
  };
  const crumbs = breadcrumb(siteUrl, [
    { name: "Home", path: "/" },
    { name: providerLabel(model.provider), path: providerPagePath(model.provider) },
    { name: model.name, path: modelPagePath(model) },
  ]);
  const nodes: unknown[] = [crumbs, dataset];
  if (faqs.length > 0) nodes.push(faqPageNode(faqs, model, siteUrl));
  return graph(nodes);
}

export function buildProviderStructuredData(
  provider: string,
  models: Model[],
  description: string,
  siteUrl: string,
  today: string,
): string {
  const itemList = {
    "@type": "ItemList",
    name: `${providerLabel(provider)} model deprecations`,
    description,
    numberOfItems: models.length,
    itemListElement: models.map((model, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absolute(siteUrl, modelPagePath(model)),
      name: `${model.name} — ${lifecycle(model, today).status}`,
    })),
  };
  const crumbs = breadcrumb(siteUrl, [
    { name: "Home", path: "/" },
    { name: providerLabel(provider), path: providerPagePath(provider) },
  ]);
  return graph([crumbs, itemList]);
}

/**
 * The About page carries the Organization node a second time, so the editorial
 * policy and the entity that stands behind it are stated in the same graph
 * rather than only on the homepage.
 */
export function buildAboutStructuredData(
  description: string,
  siteUrl: string,
  today: string,
): string {
  const about = {
    "@type": "AboutPage",
    "@id": `${siteUrl}${ABOUT_PATH}#about`,
    name: `How ${SITE_NAME} is built`,
    description,
    url: absolute(siteUrl, ABOUT_PATH),
    dateModified: today,
    mainEntity: { "@id": `${siteUrl}/#org` },
    publisher: { "@id": `${siteUrl}/#org` },
  };
  const crumbs = breadcrumb(siteUrl, [
    { name: "Home", path: "/" },
    { name: "About", path: ABOUT_PATH },
  ]);
  return graph([crumbs, organizationNode(siteUrl), about]);
}

/**
 * The cross-provider hubs (/deprecated, /retired, /shutdowns/<year>) are all the
 * same shape: an ordered slice of the catalog under a breadcrumb trail. `crumbs`
 * is everything below Home, so a year hub can nest under Shutdowns.
 */
export function buildHubStructuredData(
  name: string,
  description: string,
  entries: { model: Model }[],
  crumbs: Crumb[],
  siteUrl: string,
  today: string,
): string {
  const itemList = {
    "@type": "ItemList",
    name,
    description,
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absolute(siteUrl, modelPagePath(entry.model)),
      name: `${modelFullLabel(entry.model)} — ${lifecycle(entry.model, today).status}`,
    })),
  };
  return graph([breadcrumb(siteUrl, [{ name: "Home", path: "/" }, ...crumbs]), itemList]);
}

export function buildCalendarStructuredData(
  entries: { model: Model; life: { shutdown?: string } }[],
  description: string,
  siteUrl: string,
): string {
  const itemList = {
    "@type": "ItemList",
    name: "AI model shutdown calendar",
    description,
    numberOfItems: entries.length,
    itemListElement: entries.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absolute(siteUrl, modelPagePath(entry.model)),
      name: `${modelFullLabel(entry.model)} shuts down ${entry.life.shutdown ?? "date unknown"}`,
    })),
  };
  const crumbs = breadcrumb(siteUrl, [
    { name: "Home", path: "/" },
    { name: "Shutdown calendar", path: CALENDAR_PATH },
  ]);
  return graph([crumbs, itemList]);
}

export function buildChangelogStructuredData(
  entries: ChangeEntry[],
  description: string,
  siteUrl: string,
): string {
  const itemList = {
    "@type": "ItemList",
    name: "Model deprecation changelog",
    description,
    numberOfItems: entries.length,
    itemListElement: entries.slice(0, 100).map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absolute(siteUrl, entry.path),
      name: `${entry.date}: ${entry.title}`,
    })),
  };
  const crumbs = breadcrumb(siteUrl, [
    { name: "Home", path: "/" },
    { name: "Changelog", path: CHANGELOG_PATH },
  ]);
  return graph([crumbs, itemList]);
}
