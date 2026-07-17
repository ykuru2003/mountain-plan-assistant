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
  sunrise: string;
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

function setCellHyperlink(document: Document, relations: Document, table: number, row: number, cell: number, label: string, url: string) {
  const target = getCell(document, table, row, cell);
  clearCell(target);
  const paragraph = appendParagraph(document, target, "");
  appendHyperlink(document, paragraph, label, addExternalRelationship(relations, url));
}

function splitScheduleDays(lines: string[]) {
  const groups: string[][] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^＜\d+日目/.test(line)) groups.push([line]);
    else if (groups.length) groups.at(-1)?.push(line);
  }
  return groups.length ? groups : [lines.filter(Boolean)];
}

function appendScheduleParagraph(document: Document, cell: Element, text: string) {
  const paragraph = appendParagraph(document, cell, /^(?:＜|起床時刻|就寝時刻)/.test(text) ? text : text, /^＜/.test(text));
  if (/^(?:起床|就寝)時刻\s*[:：]/.test(text)) {
    const run = paragraph.getElementsByTagName("w:r").item(0);
    if (run) {
      let properties = run.getElementsByTagName("w:rPr").item(0);
      if (!properties) {
        properties = wordElement(document, "rPr");
        run.insertBefore(properties, run.firstChild);
      }
      const highlight = wordElement(document, "highlight");
      highlight.setAttributeNS(WORD_NS, "w:val", "yellow");
      properties.appendChild(highlight);
    }
  }
}

function setScheduleColumns(document: Document, lines: string[]) {
  const target = getCell(document, 0, 5, 1);
  clearCell(target);
  const groups = splitScheduleDays(lines);
  if (groups.length <= 1) {
    for (const line of groups[0] ?? []) appendScheduleParagraph(document, target, line);
    return;
  }

  const table = wordElement(document, "tbl");
  const tableProperties = wordElement(document, "tblPr");
  const tableWidth = wordElement(document, "tblW");
  tableWidth.setAttributeNS(WORD_NS, "w:w", "5400");
  tableWidth.setAttributeNS(WORD_NS, "w:type", "dxa");
  tableProperties.appendChild(tableWidth);
  const layout = wordElement(document, "tblLayout");
  layout.setAttributeNS(WORD_NS, "w:type", "fixed");
  tableProperties.appendChild(layout);
  const borders = wordElement(document, "tblBorders");
  const insideVertical = wordElement(document, "insideV");
  insideVertical.setAttributeNS(WORD_NS, "w:val", "single");
  insideVertical.setAttributeNS(WORD_NS, "w:sz", "6");
  insideVertical.setAttributeNS(WORD_NS, "w:color", "B7B7B7");
  borders.appendChild(insideVertical);
  tableProperties.appendChild(borders);
  table.appendChild(tableProperties);
  const grid = wordElement(document, "tblGrid");
  for (let index = 0; index < 2; index += 1) {
    const column = wordElement(document, "gridCol");
    column.setAttributeNS(WORD_NS, "w:w", "2700");
    grid.appendChild(column);
  }
  table.appendChild(grid);

  for (let rowIndex = 0; rowIndex < Math.ceil(groups.length / 2); rowIndex += 1) {
    const row = wordElement(document, "tr");
    for (let columnIndex = 0; columnIndex < 2; columnIndex += 1) {
      const cell = wordElement(document, "tc");
      const properties = wordElement(document, "tcPr");
      const width = wordElement(document, "tcW");
      width.setAttributeNS(WORD_NS, "w:w", "2700");
      width.setAttributeNS(WORD_NS, "w:type", "dxa");
      properties.appendChild(width);
      cell.appendChild(properties);
      const group = groups[rowIndex * 2 + columnIndex] ?? [];
      for (const line of group) appendScheduleParagraph(document, cell, line);
      if (!group.length) appendParagraph(document, cell, "");
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  target.appendChild(table);
  appendParagraph(document, target, "");
}

function ensureTableRows(document: Document, tableIndex: number, desiredDataRows: number) {
  const table = document.getElementsByTagName("w:tbl").item(tableIndex);
  if (!table) return;
  let rows = Array.from(table.childNodes).filter((node) => node.nodeName === "w:tr") as Element[];
  while (rows.length < desiredDataRows + 1) {
    const templateRow = rows.at(-1);
    if (!templateRow) break;
    table.appendChild(templateRow.cloneNode(true));
    rows = Array.from(table.childNodes).filter((node) => node.nodeName === "w:tr") as Element[];
  }
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
  const notesCell = getCell(document, 0, 7, 1);
  clearCell(notesCell);
  const notes = [
    plan.courseTimeMultiplier && `コースタイム倍率：${plan.courseTimeMultiplier}`,
    plan.sunset && `初日の日の入り：${plan.sunset}`,
    plan.sunrise && `日の出：${plan.sunrise}`,
  ].filter(Boolean) as string[];
  for (const line of notes) appendParagraph(document, notesCell, line);
  const transportLines = cleanManualMarker(plan.transport).split("\n").map((line) => line.trim()).filter(Boolean);
  transportLines.forEach((line, index) => appendParagraph(document, notesCell, `${index === 0 ? "交通：" : ""}${line}`));
  for (const link of plan.lodgingLinks.filter((item) => /^https:\/\//.test(item.url))) {
    const paragraph = appendParagraph(document, notesCell, "宿泊地URL：");
    appendHyperlink(document, paragraph, link.title, addExternalRelationship(relations, link.url));
  }
  for (let index = 0; index < 6; index += 1) {
    const [item = "", rawAmount = "", rawNote = ""] = splitColumns(plan.budgetItems[index] ?? "");
    let amount = /^(?:0|0円|¥0|￥0)$/.test(rawAmount) ? "" : rawAmount;
    const note = rawNote.replace(/1人分概算/g, "").trim();
    if (/タクシー/.test(`${item}${note}`)) amount = "未定";
    if (index === 5 && amount && !/[+＋]α$/.test(amount)) amount = `${amount}＋α`;
    if (index === 5 && !amount) amount = "＋α";
    setCell(document, 5, index + 1, 1, item);
    setCell(document, 5, index + 1, 2, amount);
    setCell(document, 5, index + 1, 3, note);
  }

  ensureTableRows(document, 6, Math.max(15, plan.relatedOrganizations.length));
  for (let index = 0; index < Math.max(15, plan.relatedOrganizations.length); index += 1) {
    const [item = "", name = "", rawContact = ""] = splitColumns(plan.relatedOrganizations[index] ?? "");
    const contact = rawContact && /\d/.test(rawContact)
      ? `TEL: ${rawContact.replace(/^TEL\s*[:：]\s*/i, "")}` : rawContact;
    if (item) setCell(document, 6, index + 1, 1, item);
    const hutLink = item === "山小屋" ? [...plan.lodgingLinks, ...plan.sources].find((link) => link.title.includes(name) && /^https:\/\//.test(link.url)) : undefined;
    if (name && hutLink) setCellHyperlink(document, relations, 6, index + 1, 2, name, hutLink.url);
    else setCell(document, 6, index + 1, 2, name);
    setCell(document, 6, index + 1, 3, contact);
  }

  setScheduleColumns(document, plan.schedule);

  appendImagesAfterBodyParagraph(zip, document, relations, "〈概念図〉", images.routeMap ? [images.routeMap] : [], "route-map");
  appendImagesAfterBodyParagraph(zip, document, relations, "〈時刻表など〉", images.timetables ?? [], "timetable");

  const serializer = new XMLSerializer();
  zip.file("word/document.xml", serializer.serializeToString(document));
  zip.file("word/_rels/document.xml.rels", serializer.serializeToString(relations));
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}
