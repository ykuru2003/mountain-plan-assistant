export type Source = { title: string; url: string };

export type Plan = {
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
  lodgingLinks: Source[];
  waterSources: string[];
  foodPlan: string[];
  emergency: string;
  emergencyEvacuation: string;
  commonEquipment: string[];
  personalEquipment: string[];
  budgetItems: string[];
  relatedOrganizations: string[];
  conceptMap: string;
  routeMapUrl: string;
  timetables: string[];
  sources: Source[];
};

export type GenerateResponse = {
  plan: Plan;
  demoMode?: boolean;
  warning?: string;
  generatedImages?: {
    routeMap?: GeneratedImage;
    timetables?: GeneratedImage[];
  };
};

type GeneratedImage = {
  contentType: string;
  bytesBase64: string;
  filename?: string;
};
