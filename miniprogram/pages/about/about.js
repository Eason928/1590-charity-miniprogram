const app = getApp();

Page({
  data: {
    expanded: {
      about: true,
      history: true,
      projects: true,
      help: true,
      contact: true
    }
  },

  toggleSection(e) {
    const section = e.currentTarget.dataset.section;
    const key = `expanded.${section}`;
    this.setData({
      [key]: !this.data.expanded[section]
    });
  }
});
