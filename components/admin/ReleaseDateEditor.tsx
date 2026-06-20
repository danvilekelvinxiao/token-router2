"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function ReleaseDateEditor({ value = "", onSave }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: { officialReleaseDate: value || "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    reset({ officialReleaseDate: value || "" });
  }, [reset, value]);

  const submit = handleSubmit(async (data) => {
    try {
      const result = await onSave?.(data.officialReleaseDate.trim());
      if (result === false) {
        toast.error("保存失败");
        return;
      }
      toast.success("官方发布时间已保存");
    } catch (error) {
      toast.error(error?.message || "保存失败");
    }
  });

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 6, alignItems: "center", minWidth: 160 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <input
          placeholder="YYYY-MM 或 YYYY-MM-DD"
          aria-invalid={Boolean(errors.officialReleaseDate)}
          style={{
            width: 118,
            padding: "5px 7px",
            borderRadius: 6,
            border: "1px solid var(--dash-border)",
            background: "var(--dash-card-bg)",
            color: "var(--dash-text)",
            fontSize: 11,
          }}
          {...register("officialReleaseDate", {
            validate: (nextValue) =>
              /^(|(\d{4}-(0[1-9]|1[0-2]))|(\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])))$/.test(String(nextValue || "").trim()) ||
              "官方发布时间格式必须是 YYYY-MM 或 YYYY-MM-DD",
          })}
        />
        {errors.officialReleaseDate ? (
          <span style={{ color: "#ef4444", fontSize: 10, lineHeight: 1.2 }}>{errors.officialReleaseDate.message}</span>
        ) : null}
      </div>
      <button
        type="submit"
        className="redeem-btn small"
        style={{ fontSize: 11, padding: "2px 8px" }}
        disabled={isSubmitting}
      >
        {isSubmitting ? "保存中..." : "保存"}
      </button>
    </form>
  );
}
