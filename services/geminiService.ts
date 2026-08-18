
import { ColumnMapping } from "../types";

/**
 * Uses Server-Side Gemini API route to guess column mapping based on headers and sample data.
 * The API key is kept securely on the server and never exposed in client bundles.
 */
export const suggestMapping = async (headers: string[], sampleRow: any[]): Promise<ColumnMapping | null> => {
  try {
    const response = await fetch("/api/gemini/suggest-mapping", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        headers,
        sampleRow
      })
    });

    if (!response.ok) {
      console.warn(`Server Gemini mapping request failed with status ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data && data.mapping) {
      return data.mapping as ColumnMapping;
    }
    return null;
  } catch (error) {
    console.error("Gemini mapping failed:", error);
    return null;
  }
};
