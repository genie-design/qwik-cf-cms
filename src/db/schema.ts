import {
  integer,
  sqliteTable,
  text,
  primaryKey,
  BaseSQLiteDatabase,
} from "drizzle-orm/sqlite-core"
import { relations } from "drizzle-orm";
import { Adapter, AdapterAccount } from "@auth/core/adapters"
import { eq, and } from "drizzle-orm"

/** @internal */
export const users = sqliteTable("users", {
  id: text("id").notNull().primaryKey(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
})

/** @internal */
export const accounts = sqliteTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey(account.provider, account.providerAccountId),
  })
)

/** @internal */
export const sessions = sqliteTable("sessions", {
  sessionToken: text("sessionToken").notNull().primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
})

/** @internal */
export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey(vt.identifier, vt.token),
  })
)

/** @internal */
export const schema = { users, accounts, sessions, verificationTokens }
export type DefaultSchema = typeof schema

/** @internal */
export function SQLiteDrizzleAdapter(
  client: BaseSQLiteDatabase<any, any>
): Adapter {
  return {
    createUser: (data) => {
      return client
        .insert(users)
        .values({ ...data, id: crypto.randomUUID() })
        .returning()
        .get()
    },
    getUser: (data) => {
      return client.select().from(users).where(eq(users.id, data)).get() ?? null
    },
    getUserByEmail: (data) => {
      return (
        client.select().from(users).where(eq(users.email, data)).get() ?? null
      )
    },
    createSession: (data) => {
      return client.insert(sessions).values(data).returning().get()
    },
    getSessionAndUser: (data) => {
      return (
        client
          .select({
            session: sessions,
            user: users,
          })
          .from(sessions)
          .where(eq(sessions.sessionToken, data))
          .innerJoin(users, eq(users.id, sessions.userId))
          .get() ?? null
      )
    },
    updateUser: (data) => {
      if (!data.id) {
        throw new Error("No user id.")
      }

      return client
        .update(users)
        .set(data)
        .where(eq(users.id, data.id))
        .returning()
        .get()
    },
    updateSession: (data) => {
      return client
        .update(sessions)
        .set(data)
        .where(eq(sessions.sessionToken, data.sessionToken))
        .returning()
        .get()
    },
    linkAccount: (rawAccount) => {
      const updatedAccount = client
        .insert(accounts)
        .values(rawAccount)
        .returning()
        .get()

      const account: AdapterAccount = {
        ...updatedAccount,
        type: updatedAccount.type,
        access_token: updatedAccount.access_token ?? undefined,
        token_type: updatedAccount.token_type ?? undefined,
        id_token: updatedAccount.id_token ?? undefined,
        refresh_token: updatedAccount.refresh_token ?? undefined,
        scope: updatedAccount.scope ?? undefined,
        expires_at: updatedAccount.expires_at ?? undefined,
        session_state: updatedAccount.session_state ?? undefined,
      }

      return account
    },
    getUserByAccount: (account) => {
      const results = client
        .select()
        .from(accounts)
        .leftJoin(users, eq(users.id, accounts.userId))
        .where(
          and(
            eq(accounts.provider, account.provider),
            eq(accounts.providerAccountId, account.providerAccountId)
          )
        )
        .get()

      return results?.users ?? null
    },
    deleteSession: (sessionToken) => {
      return (
        client
          .delete(sessions)
          .where(eq(sessions.sessionToken, sessionToken))
          .returning()
          .get() ?? null
      )
    },
    createVerificationToken: (token) => {
      return client.insert(verificationTokens).values(token).returning().get()
    },
    useVerificationToken: (token) => {
      try {
        return (
          client
            .delete(verificationTokens)
            .where(
              and(
                eq(verificationTokens.identifier, token.identifier),
                eq(verificationTokens.token, token.token)
              )
            )
            .returning()
            .get() ?? null
        )
      } catch (err) {
        throw new Error("No verification token found.")
      }
    },
    deleteUser: (id) => {
      return client.delete(users).where(eq(users.id, id)).returning().get()
    },
    unlinkAccount: (account) => {
      client
        .delete(accounts)
        .where(
          and(
            eq(accounts.providerAccountId, account.providerAccountId),
            eq(accounts.provider, account.provider)
          )
        )
        .run()

      return undefined
    },
  }
}




export const auditSchema = {
  created_on: integer('created_on'),
  updated_on: integer('updated_on')
}


export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsSchema = {
  id: text("id").primaryKey(),
  title: text("title"),
  body: text("body"),
  userId: text("user_id"),
}
export const posts = sqliteTable("posts", {...postsSchema, ...auditSchema});

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
}));

export interface ApiConfig {
  table: string;
  route: string;
}

export const apiConfig: ApiConfig[] = [
  { table: "users", route: "users" },
  { table: "posts", route: "posts" },
];
