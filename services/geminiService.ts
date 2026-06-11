
import { GoogleGenAI, Type } from "@google/genai";
import { ColumnMapping } from "../types";

/**
 * Uses Gemini to guess column mapping based on headers and sample data
 */
export const suggestMapping = async (headers: string[], sampleRow: any[]): Promise<ColumnMapping | null> => {
  if (!process.env.API_KEY) {
    console.warn("No API Key found for Gemini");
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
    I have a spreadsheet with the following headers: ${JSON.stringify(headers)}
    Here is a sample row of data: ${JSON.stringify(sampleRow)}
    
    I need to map these columns to geographic coordinates.
    Identify which column represents:
    - X Coordinate (Easting or Longitude)
    - Y Coordinate (Northing or Latitude)
    - Z Coordinate (Elevation/Height) - Optional
    - ID / Point Name - Optional
    - Description - Optional

    Return the exact header name for each. If not found, return null.
    `;

    // Updated model to gemini-3-flash-preview as per guidelines for Basic Text Tasks
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            xColumn: { type: Type.STRING },
            yColumn: { type: Type.STRING },
            zColumn: { type: Type.STRING },
            idColumn: { type: Type.STRING },
            descColumn: { type: Type.STRING },
          }
        }
      }
    });

    if (response.text) {
      return JSON.parse(response.text) as ColumnMapping;
    }
    return null;

  } catch (error) {
    console.error("Gemini mapping failed", error);
    return null;
  }
};
