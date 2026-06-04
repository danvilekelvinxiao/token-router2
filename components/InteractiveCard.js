export default function InteractiveCard({
  as: Tag = "article",
  className = "",
  title = "",
  hint = "",
  selected = false,
  children,
  onClick,
  onDetailClick,
  ...props
}) {
  function handleKeyDown(event) {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick(event);
    }
  }

  return (
    <Tag
      className={`interactive-card ${selected ? "is-selected" : ""} ${className}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={title || hint}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      {...props}
    >
      <button
        type="button"
        className="interactive-card-icon"
        aria-label="查看详情"
        onClick={(event) => {
          event.stopPropagation();
          (onDetailClick || onClick)?.(event);
        }}
      >
        ↗
      </button>
      {children}
    </Tag>
  );
}
