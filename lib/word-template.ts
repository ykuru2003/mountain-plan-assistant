import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import PizZip from "pizzip";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const HYPERLINK_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink";
const IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PICTURE_NS = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const WORD_DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";

type Link = { title: string; url: string };

export type WordPlan = {
  title: string;
  dates: string;
  area: string;
  purpose: string;
  meeting: string;
  dismissal: string;
  entryPoint: string;
  entryTime: string;
  exitPoint: string;
  exitTime: string;
  summary: string;
  route: string;
  schedule: string[];
  courseTimeMultiplier: string;
  sunset: string;
  weather: string;
  risks: string[];
  transport: string;
  lodging: string;
  lodgingLinks: Link[];
  waterSources: string[];
  emergency: string;
  emergencyEvacuation: string;
  budgetItems: string[];
  relatedOrganizations: string[];
  conceptMap: string;
  routeMapUrl: string;
  timetables: string[];
  sources: Link[];
};

export type WordImage = {
  bytes: Uint8Array;
  extension: "png" | "jpg" | "jpeg";
  contentType: "image/png" | "image/jpeg";
};

function wordElement(document: Document, name: string) {
  return document.createElementNS(WORD_NS, `w:${name}`);
}

function namespacedElement(document: Document, namespace: string, name: string) {
  return document.createElementNS(namespace, name);
}

function getCell(document: Document, tableIndex: number, rowIndex: number, cellIndex: number) {
  const table = document.getElementsByTagName("w:tbl").item(tableIndex);
  const row = table?.getElementsByTagName("w:tr").item(rowIndex);
  const cell = row?.getElementsByTagName("w:tc").item(cellIndex);
  if (!cell) throw new Error(`テンプレートの表セルが見つかりません (${tableIndex}/${rowIndex}/${cellIndex})`);
  return cell;
}

function clearCell(cell: Element) {
  const children = Array.from(cell.childNodes);
  for (const child of children) {
    if (child.nodeName !== "w:tcPr") cell.removeChild(child);
  }
}

function appendParagraph(document: Document, cell: Element, text: string, bold = false) {
  const paragraph = wordElement(document, "p");
  const run = wordElement(document, "r");
  if (bold) {
    const properties = wordElement(document, "rPr");
    properties.appendChild(wordElement(document, "b"));
    run.appendChild(properties);
  }
  const node = wordElement(document, "t");
  node.setAttribute("xml:space", "preserve");
  node.appendChild(document.createTextNode(text || " "));
  run.appendChild(node);
  paragraph.appendChild(run);
  cell.appendChild(paragraph);
  return paragraph;
}

function appendHyperlink(document: Document, paragraph: Element, label: string, relationId: string) {
  const hyperlink = wordElement(document, "hyperlink");
  hyperlink.setAttributeNS(REL_NS, "r:id", relationId);
  const run = wordElement(document, "r");
  const properties = wordElement(document, "rPr");
  const style = wordElement(document, "rStyle");
  style.setAttributeNS(WORD_NS, "w:val", "Hyperlink");
  properties.appendChild(style);
  run.appendChild(properties);
  const text = wordElement(document, "t");
  text.appendChild(document.createTextNode(label));
  run.appendChild(text);
  hyperlink.appendChild(run);
  paragraph.appendChild(hyperlink);
}

function setCell(document: Document, table: number, row: number, cell: number, value: string | string[]) {
  const target = getCell(document, table, row, cell);
  clearCell(target);
  const lines = Array.isArray(value) ? value : value.split("\n");
  for (const line of lines.length ? lines : [""]) appendParagraph(document, target, line);
}

function splitColumns(value: string) {
  return value.split(/[｜|]/).map((part) => part.trim());
}

function cleanManualMarker(value: string) {
  return value.replace(/^【手動編集】\s*/, "").trim();
}

function nextRelationshipId(relations: Document) {
  const root = relations.documentElement;
  const ids = Array.from(relations.getElementsByTagName("Relationship"))
    .map((node) => node.getAttribute("Id") ?? "");
  let number = ids.length + 1;
  while (ids.includes(`rId${number}`)) number += 1;
  return { id: `rId${number}`, root };
}

function addExternalRelationship(relations: Document, url: string) {
  const { id, root } = nextRelationshipId(relations);
  const relationship = relations.createElementNS(PACKAGE_REL_NS, "Relationship");
  relationship.setAttribute("Id", id);
  relationship.setAttribute("Type", HYPERLINK_REL);
  relationship.setAttribute("Target", url);
  relationship.setAttribute("TargetMode", "External");
  root.appendChild(relationship);
  return id;
}

function addImageRelationship(relations: Document, target: string) {
  const { id, root } = nextRelationshipId(relations);
  const relationship = relations.createElementNS(PACKAGE_REL_NS, "Relationship");
  relationship.setAttribute("Id", id);
  relationship.setAttribute("Type", IMAGE_REL);
  relationship.setAttribute("Target", target);
  root.appendChild(relationship);
  return id;
}

function ensureImageContentType(zip: PizZip, image: WordImage) {
  const file = zip.file("[Content_Types].xml");
  if (!file) return;
  const parser = new DOMParser();
  const types = parser.parseFromString(file.asText(), "application/xml");
  const extension = image.extension === "jpeg" ? "jpg" : image.extension;
  const exists = Array.from(types.getElementsByTagName("Default"))
    .some((node) => node.getAttribute("Extension") === extension);
  if (!exists) {
    const item = types.createElementNS("http://schemas.openxmlformats.org/package/2006/content-types", "Default");
    item.setAttribute("Extension", extension);
    item.setAttribute("ContentType", image.contentType);
    types.documentElement.appendChild(item);
    zip.file("[Content_Types].xml", new XMLSerializer().serializeToString(types));
  }
}

function createImageParagraph(document: Document, relationId: string, name: string, id: number) {
  const width = "5486400";
  const height = "3657600";
  const paragraph = wordElement(document, "p");
  const run = wordElement(document, "r");
  const drawing = wordElement(document, "drawing");
  const inline = namespacedElement(document, WORD_DRAWING_NS, "wp:inline");
  for (const attr of ["distT", "distB", "distL", "distR"]) inline.setAttribute(attr, "0");
  const extent = namespacedElement(document, WORD_DRAWING_NS, "wp:extent");
  extent.setAttribute("cx", width);
  extent.setAttribute("cy", height);
  inline.appendChild(extent);
  const docProperties = namespacedElement(document, WORD_DRAWING_NS, "wp:docPr");
  docProperties.setAttribute("id", String(id));
  docProperties.setAttribute("name", name);
  inline.appendChild(docProperties);
  const graphic = namespacedElement(document, DRAWING_NS, "a:graphic");
  const graphicData = namespacedElement(document, DRAWING_NS, "a:graphicData");
  graphicData.setAttribute("uri", PICTURE_NS);
  const picture = namespacedElement(document, PICTURE_NS, "pic:pic");
  const nonVisual = namespacedElement(document, PICTURE_NS, "pic:nvPicPr");
  const nonVisualProperties = namespacedElement(document, PICTURE_NS, "pic:cNvPr");
  nonVisualProperties.setAttribute("id", String(id));
  nonVisualProperties.setAttribute("name", name);
  nonVisual.appendChild(nonVisualProperties);
  nonVisual.appendChild(namespacedElement(document, PICTURE_NS, "pic:cNvPicPr"));
  picture.appendChild(nonVisual);
  const blipFill = namespacedElement(document, PICTURE_NS, "pic:blipFill");
  const blip = namespacedElement(document, DRAWING_NS, "a:blip");
  blip.setAttributeNS(REL_NS, "r:embed", relationId);
  blipFill.appendChild(blip);
  const stretch = namespacedElement(document, DRAWING_NS, "a:stretch");
  stretch.appendChild(namespacedElement(document, DRAWING_NS, "a:fillRect"));
  blipFill.appendChild(stretch);
  picture.appendChild(blipFill);
  const shape = namespacedElement(document, PICTURE_NS, "pic:spPr");
  const transform = namespacedElement(document, DRAWING_NS, "a:xfrm");
  const offset = namespacedElement(document, DRAWING_NS, "a:off");
  offset.setAttribute("x", "0"); offset.setAttribute("y", "0");
  const size = namespacedElement(document, DRAWING_NS, "a:ext");
  size.setAttribute("cx", width); size.setAttribute("cy", height);
  transform.appendChild(offset); transform.appendChild(size); shape.appendChild(transform);
  const geometry = namespacedElement(document, DRAWING_NS, "a:prstGeom");
  geometry.setAttribute("prst", "rect");
  geometry.appendChild(namespacedElement(document, DRAWING_NS, "a:avLst"));
  shape.appendChild(geometry); picture.appendChild(shape);
  graphicData.appendChild(picture); graphic.appendChild(graphicData); inline.appendChild(graphic);
  drawing.appendChild(inline); run.appendChild(drawing); paragraph.appendChild(run);
  return paragraph;
}

function appendImagesAfterBodyParagraph(zip: PizZip, document: Document, relations: Document, label: string, images: WordImage[], prefix: string) {
  if (!images.length) return;
  const body = document.getElementsByTagName("w:body").item(0);
  if (!body) return;
  const anchor = Array.from(body.childNodes).find((node) =>
    node.nodeName === "w:p" && Array.from((node as Element).getElementsByTagName("w:t"))
      .some((text) => (text.textContent ?? "").includes(label)),
  );
  if (!anchor) return;
  let cursor: ChildNode = anchor;
  images.forEach((image, index) => {
    const extension = image.extension === "jpeg" ? "jpg" : image.extension;
    const filename = `${prefix}-${index + 1}.${extension}`;
    zip.file(`word/media/${filename}`, image.bytes);
    ensureImageContentType(zip, image);
    const relationId = addImageRelationship(relations, `media/${filename}`);
    const paragraph = createImageParagraph(document, relationId, filename, 1000 + index + (prefix === "route-map" ? 0 : 100));
    body.insertBefore(paragraph, cursor.nextSibling);
    cursor = paragraph;
  });
}

export function fillWordTemplate(
  template: ArrayBuffer,
  plan: WordPlan,
  images: { routeMap?: WordImage; timetables?: WordImage[] } = {},
) {
  const zip = new PizZip(template);
  const documentFile = zip.file("word/document.xml");
  const relationsFile = zip.file("word/_rels/document.xml.rels");
  if (!documentFile || !relationsFile) throw new Error("Wordテンプレートの本文を読み込めませんでした。");

  const parser = new DOMParser();
  const document = parser.parseFromString(documentFile.asText(), "application/xml");
  const relations = parser.parseFromString(relationsFile.asText(), "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error("Wordテンプレートの形式を解析できませんでした。");

  setCell(document, 0, 0, 0, plan.title || "泊まり山行計画書");
  setCell(document, 0, 1, 1, plan.dates);
  setCell(document, 0, 1, 3, plan.area);
  setCell(document, 0, 2, 1, plan.purpose);
  setCell(document, 0, 3, 1, cleanManualMarker(plan.meeting));
  setCell(document, 0, 3, 4, cleanManualMarker(plan.dismissal));
  setCell(document, 0, 4, 1, [plan.entryPoint, plan.entryTime && `入山時刻：${plan.entryTime}`].filter(Boolean));
  setCell(document, 0, 4, 4, [plan.exitPoint, plan.exitTime && `下山時刻：${plan.exitTime}`].filter(Boolean));
  setCell(document, 0, 5, 1, plan.schedule);

  const notesCell = getCell(document, 0, 7, 1);
  clearCell(notesCell);
  const notes = [
    plan.courseTimeMultiplier && `コースタイム倍率：${plan.courseTimeMultiplier}`,
    plan.sunset && `日没：${plan.sunset}`,
    cleanManualMarker(plan.transport) && `交通：${cleanManualMarker(plan.transport)}`,
    plan.timetables.length && `時刻表：${plan.timetables.join("／")}`,
  ].filter(Boolean) as string[];
  for (const line of notes) appendParagraph(document, notesCell, line);
  for (const link of plan.lodgingLinks.filter((item) => /^https:\/\//.test(item.url))) {
    const paragraph = appendParagraph(document, notesCell, "宿泊地URL：");
    appendHyperlink(document, paragraph, link.title, addExternalRelationship(relations, link.url));
  }
  for (let index = 0; index < 6; index += 1) {
    const [item = "", amount = "", note = ""] = splitColumns(plan.budgetItems[index] ?? "");
    setCell(document, 5, index + 1, 1, item);
    setCell(document, 5, index + 1, 2, amount);
    setCell(document, 5, index + 1, 3, note);
  }

  for (let index = 0; index < 15; index += 1) {
    const [, name = "", contact = ""] = splitColumns(plan.relatedOrganizations[index] ?? "");
    setCell(document, 6, index + 1, 2, name);
    setCell(document, 6, index + 1, 3, contact);
  }

  appendImagesAfterBodyParagraph(zip, document, relations, "〈概念図〉", images.routeMap ? [images.routeMap] : [], "route-map");
  appendImagesAfterBodyParagraph(zip, document, relations, "〈時刻表など〉", images.timetables ?? [], "timetable");

  const serializer = new XMLSerializer();
  zip.file("word/document.xml", serializer.serializeToString(document));
  zip.file("word/_rels/document.xml.rels", serializer.serializeToString(relations));
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}
