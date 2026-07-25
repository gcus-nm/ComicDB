import { requireRequestUser } from "@/lib/auth";
import { csvTemplate } from "@/lib/csv";
import { errorResponse } from "@/lib/security";

export async function GET(request: Request) {
  try {
    requireRequestUser(request);
    return new Response(csvTemplate(), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="comicdb-template.csv"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
