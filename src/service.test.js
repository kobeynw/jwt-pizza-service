const request = require('supertest');
const app = require('./service');
const { DB, Role } = require('./database/database');


const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;
let adminUserAuthToken;
let franchiseId;
let storeId;

beforeAll(async () => {
  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;

  const adminUser = await createAdminUser();
  const loginRes = await request(app).put('/api/auth').send(adminUser);
  adminUserAuthToken = loginRes.body.token;
});

async function createAdminUser() {
  let user = { password: 'toomanysecrets', roles: [{ role: Role.Admin }] };
  user.name = Math.random().toString(36).substring(2, 12);
  user.email = user.name + '@admin.com';
 
  user = await DB.addUser(user);
  return { ...user, password: 'toomanysecrets' };
}

test('docs', async () => {
  const docsRes = await request(app).get('/api/docs');
  expect(docsRes.status).toBe(200);
  expect(docsRes.body).toBeJson;
});

test('default', async () => {
  const defaultRes = await request(app).get('/');
  expect(defaultRes.status).toBe(200);
  expect(defaultRes.body.message).toBe('welcome to JWT Pizza');
});

test('unknown endpoint error', async () => {
  const unknownRes = await request(app).post('/api/random');
  expect(unknownRes.status).toBe(404);
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expect(loginRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);

  const { password, ...user } = { ...testUser, roles: [{ role: 'diner' }] };
  expect(loginRes.body.user).toMatchObject(user);
  expect(password).toBe('a');
});

test('register', async () => {
  const testUser2 = { name: 'pizza pizza', email: Math.random().toString(36).substring(2, 12) + '@test.com', password: 'b' };
  const registerRes = await request(app).post('/api/auth').send(testUser2);
  expect(registerRes.status).toBe(200);
  expect(registerRes.body.token).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
});

test('get user', async () => {
  const userRes = await request(app).get('/api/user/me').set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(userRes.status).toBe(200);
  expect(userRes.body.name).toBe('pizza diner');
  expect(userRes.body.email).toMatch(/.+@test\.com/);
  expect(userRes.body.roles).toMatchObject([{ role: 'diner' }]);
  testUser['id'] = userRes.body.id;
});

test('update user', async () => {
  const updatedUser = {
    'name': 'pizza diner',
    'email': testUser.email,
    'password': 'b',
  };
  const userRes = await request(app).put(`/api/user/${testUser.id}`).set('Authorization', `Bearer ${testUserAuthToken}`).send(updatedUser);
  expect(userRes.status).toBe(200);
  expect(userRes.body.user).toMatchObject({ 'id': testUser.id, 'name': updatedUser.name, 'email': updatedUser.email, 'roles': [{ role: 'diner' }] });
});

test('get menu', async () => {
  const orderRes = await request(app).get('/api/order/menu');
  expect(orderRes.status).toBe(200);
  orderRes.body.forEach(item => {
    expect(item.id).toBeInteger;
    expect(item.title).toBeString;
    expect(item.image).toMatch(/.+\..+/);
    expect(item.price).toBeNumber;
    expect(item.description).toBeString;
  });
});

test('create franchise unauthorized error', async () => {
  const newFranchise = {
    'name': Math.random().toString(36).substring(2, 12),
    'admins': [
      {
        'email': testUser.email,
      },
    ],
  };
  const franchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${testUserAuthToken}`).send(newFranchise);
  expect(franchiseRes.status).toBe(403);
});

test('logout', async () => {
  const logoutRes = await request(app).delete('/api/auth').set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(logoutRes.body.message).toBe('logout successful');
});
