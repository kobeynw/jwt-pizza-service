const request = require('supertest');
const app = require('./service');
const { DB, Role } = require('./database/database');
const metrics = require('./metrics');


const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
const userToDelete = { name: 'delete me', email: 'deleteme@test.com', password: 'c' };
let userIdToDelete;
let testUserAuthToken;
let adminUserAuthToken;
let franchiseId;
let storeId;

beforeAll(async () => {
  metrics.stopMetrics();

  testUser.email = Math.random().toString(36).substring(2, 12) + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;

  const registerToDeleteRes = await request(app).post('/api/auth').send(userToDelete);
  userIdToDelete = registerToDeleteRes.body.user.id;

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

test('list users unauthorized', async () => {
  const listUsersRes = await request(app).get('/api/user');
  expect(listUsersRes.status).toBe(401);
});

test('list users', async () => {
  const listUsersRes = await request(app)
    .get('/api/user?page=1&limit=10&name=*')
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(listUsersRes.status).toBe(200);
  expect (listUsersRes.body.more).toBeDefined();
  listUsersRes.body.users.forEach(user => {
    expect(user.id).toBeInteger;
    expect(user.name).toBeString;
    expect(user.email).toMatch(/.+@.+\..+/);
    user.roles.forEach(roleObj => {
      expect(['diner', 'franchisee', 'admin']).toContain(roleObj.role);
    });
  });
});

test('list users searching for name', async () => {
  const listUsersRes = await request(app)
    .get('/api/user?page=1&limit=10&name=pizza+diner')
    .set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(listUsersRes.status).toBe(200);
  expect (listUsersRes.body.more).toBeDefined();
  listUsersRes.body.users.forEach(user => {
    expect(user.id).toBeInteger;
    expect(user.name).toBeString;
    expect(user.email).toMatch(/.+@.+\..+/);
    user.roles.forEach(roleObj => {
      expect(['franchisee']).toContain(roleObj.role);
    });
  });
});

test('delete user unauthorized', async () => {
  const deleteUserId = 5;
  const userRes = await request(app).delete(`/api/user/${deleteUserId}`).set('Authorization', `Bearer ${testUserAuthToken}`);
  expect(userRes.status).toBe(403);
  expect(userRes.body.message).toBe("unauthorized");
});

test('delete user', async () => {
  const userRes = await request(app).delete(`/api/user/${userIdToDelete}`).set('Authorization', `Bearer ${adminUserAuthToken}`);
  expect(userRes.status).toBe(200);
  expect(userRes.body.message).toBe("user successfully deleted");
});

test('get menu', async () => {
  const orderRes = await request(app).get('/api/order/menu').set('Authorization', `Bearer ${adminUserAuthToken}`);
  expect(orderRes.status).toBe(200);
  orderRes.body.forEach(item => {
    console.log(`ITEM ID: ${item.id}`);
    console.log(`ITEM PRICE: ${item.price}`);
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

test('update menu', async () => {
  const newItem = {
    'title': 'Dessert',
    'image': 'pizza9.png',
    'price': 10.59,
    'description': 'Something delightfully sweet',
  };
  const orderRes = await request(app).put('/api/order/menu').set('Authorization', `Bearer ${adminUserAuthToken}`).send(newItem);
  expect(orderRes.status).toBe(200);
  expect(orderRes.body.id).toBeInteger;
  expect(orderRes.body.title).toBeString;
  expect(orderRes.body.price).toBeNumber;
  expect(orderRes.body.description).toBeString;
});

test('create order', async () => {
  const newOrder = {
    'franchiseId': 1,
    'storeId': 1,
    'items': [
      {
        'menuId': 1,
        'description': 'Something delightfully sweet',
        'price': 10.59,
      },
    ],
  };
  const orderRes = await request(app).post('/api/order').set('Authorization', `Bearer ${adminUserAuthToken}`).send(newOrder);
  expect(orderRes.status).toBe(200);
  expect(orderRes.body.order).toMatchObject(newOrder);
  expect(orderRes.body.jwt).toBeString;
});

test('get order', async () => {
  const orderRes = await request(app).get('/api/order').set('Authorization', `Bearer ${adminUserAuthToken}`);
  expect(orderRes.status).toBe(200);
  orderRes.body.orders.forEach(order => {
    expect(order.id).toBeInteger;
    expect(order.franchiseId).toBeInteger;
    expect(order.storeId).toBeInteger;
    expect(order.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    order.items.forEach(item => {
      expect(item.id).toBeInteger;
      expect(item.menuId).toBeInteger;
      expect(item.price).toBeNumber;
      expect(item.description).toBeString;
    });
  });
});

test('create franchise', async () => {
  const newFranchise = {
    'name': Math.random().toString(36).substring(2, 12),
    'admins': [
      {
        'email': testUser.email,
      },
    ],
  };
  const franchiseRes = await request(app).post('/api/franchise').set('Authorization', `Bearer ${adminUserAuthToken}`).send(newFranchise);
  expect(franchiseRes.status).toBe(200);
  expect(franchiseRes.body.name).toBe(newFranchise.name);
  expect(franchiseRes.body.id).toBeInteger;
  franchiseRes.body.admins.forEach(admin => {
    expect(admin.name).toBe(testUser.name);
    expect(admin.email).toBe(testUser.email);
    expect(admin.id).toBe(testUser.id);
  });
  franchiseId = franchiseRes.body.id;
});

test('create store', async () => {
  const newStore = {
    'franchiseId': franchiseId,
    'name': 'SLC'
  };
  const storeRes = await request(app).post(`/api/franchise/${franchiseId}/store`).set('Authorization', `Bearer ${adminUserAuthToken}`).send(newStore);
  expect(storeRes.status).toBe(200); 
  expect(storeRes.body.id).toBeInteger;
  expect(storeRes.body.name).toBe(newStore.name);
  expect(storeRes.body.totalRevenue).toBeNumber;
  storeId = storeRes.body.id;
});

test('get franchises', async () => {
  const franchiseRes = await request(app).get('/api/franchise?page=0&limit=10&name=*');
  expect(franchiseRes.status).toBe(200);
  franchiseRes.body.franchises.forEach(franchise => {
    expect(franchise.id).toBeInteger;
    expect(franchise.name).toBeString;
    
    franchise.admins?.forEach(admin => {
      expect(admin.id).toBeInteger;
      expect(admin.name).toBeString;
      expect(admin.email).toBeString;
    });

    franchise.stores.forEach(store => {
      expect(store.id).toBeInteger;
      expect(store.name).toBeString;
      expect(store.totalRevenue).toBeNumber;
    });
  });
});

test('get user franchises', async () => {
  const franchiseRes = await request(app).get(`/api/franchise/${testUser.id}`).set('Authorization', `Bearer ${adminUserAuthToken}`);
  expect(franchiseRes.status).toBe(200);
  franchiseRes.body.forEach(franchise => {
    expect(franchise.id).toBeInteger;
    expect(franchise.name).toBeString;
    
    franchise.admins?.forEach(admin => {
      expect(admin.id).toBeInteger;
      expect(admin.name).toBeString;
      expect(admin.email).toBeString;
    });

    franchise.stores.forEach(store => {
      expect(store.id).toBeInteger;
      expect(store.name).toBeString;
      expect(store.totalRevenue).toBeNumber;
    });
  });
});

test('delete store', async () => {
  const storeRes = await request(app).delete(`/api/franchise/${franchiseId}/store/${storeId}`).set('Authorization', `Bearer ${adminUserAuthToken}`);
  expect(storeRes.status).toBe(200);
  expect(storeRes.body.message).toBe('store deleted');
});

test('delete franchise', async () => {
  const franchiseRes = await request(app).delete(`/api/franchise/${franchiseId}`).set('Authorization', `Bearer ${adminUserAuthToken}`);
  expect(franchiseRes.status).toBe(200);
  expect(franchiseRes.body.message).toBe('franchise deleted');
});

afterAll(async () => {
  await request(app).delete('/api/auth').set('Authorization', `Bearer ${adminUserAuthToken}`);
});