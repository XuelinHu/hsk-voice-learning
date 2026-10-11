export async function seedDemoUsers(client, users, makePasswordHash) {
  let inserted = 0;
  for (const user of users) {
    const password = await makePasswordHash(user.password);
    const result = await client.query(
      `INSERT INTO app_users
        (id, username, display_name, role, password_salt, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (username) DO NOTHING`,
      [user.id, user.username, user.displayName, user.role, password.salt, password.hash],
    );
    inserted += result.rowCount;
  }
  return { inserted, unchanged: users.length - inserted };
}
