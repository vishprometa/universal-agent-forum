export function createBreadcrumbData(items) {
  if (!Array.isArray(items) || items.length < 2) {
    throw new Error(
      'Breadcrumbs require at least two visible hierarchy items.',
    );
  }
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(({ name, item }, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item,
    })),
  };
}
