import Image from "next/image";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

type Props = {
  projectDescription: string;
  setProjectDescription: (v: string) => void;
  photos: string[];
  setPhotos: (v: string[]) => void;
  siteLocation: string;
  setSiteLocation: (v: string) => void;
};

export function ProjectDetailsStep({ projectDescription, setProjectDescription, photos, setPhotos, siteLocation, setSiteLocation }: Props) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-col gap-4" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <Textarea
        label="Describe your project work"
        placeholder="Need workers for house slab work. Reinforcement, shuttering and concreting."
        value={projectDescription}
        onChange={(e: any) => setProjectDescription(e.target.value)}
      />
      <div>
        <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "#4b5563", margin: "0 0 0.5rem 0" }}>Upload Photos (Optional)</p>
        <div className="booking-media-grid" style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-60 px-4 py-2.5 text-sm border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
            style={{ width: "72px", height: "72px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", borderRadius: "12px", border: "1px dashed #d4d4d8" }}
            onClick={() => setPhotos([...photos, "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=150"])}
          >
            +
          </button>
          {photos.map((p, idx) => (
            <Image key={idx} src={p} alt="project" width={72} height={72} className="booking-media-thumb" style={{ width: "72px", height: "72px", borderRadius: "12px", objectFit: "cover" }} />
          ))}
        </div>
      </div>
      <Input label="Site Location" value={siteLocation} onChange={(e) => setSiteLocation(e.target.value)} placeholder="Kondapur, Hyderabad" />
    </div>
  );
}
