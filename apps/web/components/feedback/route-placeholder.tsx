interface RoutePlaceholderProps {
  eyebrow: string;
  title: string;
  description: string;
}

export function RoutePlaceholder({
  eyebrow,
  title,
  description,
}: RoutePlaceholderProps) {
  return (
    <main className="route-placeholder">
      <section className="route-placeholder__content">
        <p className="route-placeholder__eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="route-placeholder__description">{description}</p>
      </section>
    </main>
  );
}
