export class TemplateRenderer {
  private cache = new Map<string, string>();

  async loadTemplate(name: string): Promise<string> {
    if (this.cache.has(name)) {
      return this.cache.get(name)!;
    }
    const template = await this.fetchTemplate(name);
    this.cache.set(name, template);
    return template;
  }

  render(template: string, variables: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  async renderTemplate(name: string, variables: Record<string, any>): Promise<string> {
    const template = await this.loadTemplate(name);
    return this.render(template, variables);
  }

  clearCache(name?: string): void {
    if (name) {
      this.cache.delete(name);
    } else {
      this.cache.clear();
    }
  }

  private async fetchTemplate(name: string): Promise<string> {
    return '';
  }
}