import { graphql } from '../src/lib/shopify.js';
import { config } from '../src/config.js';
const d = await graphql(`query($id: ID!){ blog(id:$id){ handle articles(first: 100){ nodes { id title isPublished } } } }`, { id: config.shopify.blogGid });
console.log(d.blog.handle); for (const a of d.blog.articles.nodes) console.log(a.isPublished, a.id, a.title);
