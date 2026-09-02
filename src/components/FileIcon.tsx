import { FOLDER_MIME_TYPE } from "@/lib/drive";

const COLORS: Record<string, string> = {
  [FOLDER_MIME_TYPE]: "text-amber-500",
  "application/vnd.google-apps.document": "text-blue-500",
  "application/vnd.google-apps.spreadsheet": "text-green-600",
  "application/vnd.google-apps.presentation": "text-yellow-500",
  "application/pdf": "text-red-500",
};

export default function FileIcon({ mimeType }: { mimeType: string }) {
  const color = COLORS[mimeType] ?? (mimeType.startsWith("image/") ? "text-purple-500" : "text-zinc-400");

  if (mimeType === FOLDER_MIME_TYPE) {
    return (
      <svg className={`h-5 w-5 shrink-0 ${color}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M2 5a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.4.6L10.4 5H16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5z" />
      </svg>
    );
  }

  return (
    <svg
      className={`h-5 w-5 shrink-0 ${color}`}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M11.5 2.5H6A1.5 1.5 0 0 0 4.5 4v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5l-4-4z" />
      <path d="M11.5 2.5v4h4" />
    </svg>
  );
}
