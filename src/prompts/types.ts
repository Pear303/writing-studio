export interface TemplateRenderer {
  loadTemplate(name: string): Promise<string>;
  render(template: string, variables: Record<string, any>): string;
  renderTemplate(name: string, variables: Record<string, any>): Promise<string>;
  clearCache(name?: string): void;
}