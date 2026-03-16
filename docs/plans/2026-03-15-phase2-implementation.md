# Phase 2 — Core Backend Modules + Frontend Foundation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build all remaining API modules (goals, clients, plans, deliveries, calculations, settings, ranking, simulator) and the frontend foundation (auth pages, layout, routing, API layer).

**Architecture:** Modular Express.js backend following the same pattern as auth/users modules (validation → service → controller → routes). React frontend with Zustand auth store, Axios interceptors, role-based sidebar layout, and React Router guards.

**Tech Stack:** Express.js, Knex.js, Joi, React 19, Vite 6, Zustand, Axios, React Router DOM, Tailwind CSS, Shadcn/ui, Lucide React

---

### Task 1: Goal Templates Module

**Files:**
- Create: `server/src/modules/goals/goals.validation.js`
- Create: `server/src/modules/goals/goals.service.js`
- Create: `server/src/modules/goals/goals.controller.js`
- Create: `server/src/modules/goals/goals.routes.js`

**Step 1: Create goals validation**

Create `server/src/modules/goals/goals.validation.js`:

```js
const Joi = require('joi');

const curveLevel = Joi.object({
  from: Joi.number().integer().min(0).required(),
  to: Joi.number().integer().min(1).allow(null).required(),
  multiplier: Joi.number().precision(2).min(0).required(),
});

const createGoalTemplateSchema = Joi.object({
  role: Joi.string().valid('producer').required(),
  producer_type: Joi.string()
    .valid('video_editor', 'designer', 'captation', 'social_media')
    .required(),
  name: Joi.string().min(2).max(100).required(),
  monthly_target: Joi.number().integer().min(1).required(),
  multiplier_cap: Joi.number().precision(2).min(1).required(),
  curve_config: Joi.object({
    levels: Joi.array().items(curveLevel).min(1).required(),
  }).required(),
});

const updateGoalTemplateSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  monthly_target: Joi.number().integer().min(1).optional(),
  multiplier_cap: Joi.number().precision(2).min(1).optional(),
  curve_config: Joi.object({
    levels: Joi.array().items(curveLevel).min(1).required(),
  }).optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

const createUserGoalSchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  goal_template_id: Joi.string().uuid().allow(null).optional(),
  month: Joi.date().required(),
  monthly_target: Joi.number().integer().min(1).required(),
  multiplier_cap: Joi.number().precision(2).min(1).optional(),
  curve_config: Joi.object({
    levels: Joi.array().items(curveLevel).min(1).required(),
  }).optional(),
});

const updateUserGoalSchema = Joi.object({
  monthly_target: Joi.number().integer().min(1).optional(),
  multiplier_cap: Joi.number().precision(2).min(1).optional(),
  curve_config: Joi.object({
    levels: Joi.array().items(curveLevel).min(1).required(),
  }).optional(),
}).min(1);

module.exports = {
  createGoalTemplateSchema,
  updateGoalTemplateSchema,
  createUserGoalSchema,
  updateUserGoalSchema,
};
```

**Step 2: Create goals service**

Create `server/src/modules/goals/goals.service.js`:

```js
const db = require('../../config/db');

class GoalsService {
  // --- Goal Templates ---

  async listTemplates(filters = {}) {
    const query = db('goal_templates').orderBy('name');
    if (filters.role) query.where('role', filters.role);
    if (filters.producer_type) query.where('producer_type', filters.producer_type);
    if (filters.is_active !== undefined) query.where('is_active', filters.is_active);
    return query;
  }

  async getTemplateById(id) {
    const template = await db('goal_templates').where({ id }).first();
    if (!template) {
      throw Object.assign(new Error('Goal template not found'), { status: 404 });
    }
    return template;
  }

  async createTemplate(data) {
    const [template] = await db('goal_templates')
      .insert({
        ...data,
        curve_config: JSON.stringify(data.curve_config),
      })
      .returning('*');
    return template;
  }

  async updateTemplate(id, data) {
    const updateData = { ...data, updated_at: new Date() };
    if (data.curve_config) {
      updateData.curve_config = JSON.stringify(data.curve_config);
    }
    const [updated] = await db('goal_templates')
      .where({ id })
      .update(updateData)
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Goal template not found'), { status: 404 });
    }
    return updated;
  }

  async deleteTemplate(id) {
    const deleted = await db('goal_templates').where({ id }).del();
    if (!deleted) {
      throw Object.assign(new Error('Goal template not found'), { status: 404 });
    }
  }

  // --- User Goals ---

  async listUserGoals(filters = {}) {
    const query = db('user_goals')
      .join('users', 'user_goals.user_id', 'users.id')
      .select(
        'user_goals.*',
        'users.name as user_name',
        'users.producer_type as user_producer_type'
      )
      .orderBy('user_goals.month', 'desc');

    if (filters.user_id) query.where('user_goals.user_id', filters.user_id);
    if (filters.month) query.where('user_goals.month', filters.month);
    return query;
  }

  async getUserGoalById(id) {
    const goal = await db('user_goals').where({ id }).first();
    if (!goal) {
      throw Object.assign(new Error('User goal not found'), { status: 404 });
    }
    return goal;
  }

  async createUserGoal(data, definedBy) {
    const insertData = {
      ...data,
      defined_by: definedBy,
    };
    if (data.curve_config) {
      insertData.curve_config = JSON.stringify(data.curve_config);
    }
    const [goal] = await db('user_goals').insert(insertData).returning('*');
    return goal;
  }

  async updateUserGoal(id, data) {
    const updateData = { ...data, updated_at: new Date() };
    if (data.curve_config) {
      updateData.curve_config = JSON.stringify(data.curve_config);
    }
    const [updated] = await db('user_goals')
      .where({ id })
      .update(updateData)
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('User goal not found'), { status: 404 });
    }
    return updated;
  }
}

module.exports = new GoalsService();
```

**Step 3: Create goals controller**

Create `server/src/modules/goals/goals.controller.js`:

```js
const goalsService = require('./goals.service');
const {
  createGoalTemplateSchema,
  updateGoalTemplateSchema,
  createUserGoalSchema,
  updateUserGoalSchema,
} = require('./goals.validation');

class GoalsController {
  // --- Goal Templates ---

  async listTemplates(req, res, next) {
    try {
      const { role, producer_type, is_active } = req.query;
      const templates = await goalsService.listTemplates({ role, producer_type, is_active });
      res.json(templates);
    } catch (err) {
      next(err);
    }
  }

  async getTemplate(req, res, next) {
    try {
      const template = await goalsService.getTemplateById(req.params.id);
      res.json(template);
    } catch (err) {
      next(err);
    }
  }

  async createTemplate(req, res, next) {
    try {
      const { error, value } = createGoalTemplateSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const template = await goalsService.createTemplate(value);
      res.status(201).json(template);
    } catch (err) {
      next(err);
    }
  }

  async updateTemplate(req, res, next) {
    try {
      const { error, value } = updateGoalTemplateSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const template = await goalsService.updateTemplate(req.params.id, value);
      res.json(template);
    } catch (err) {
      next(err);
    }
  }

  async deleteTemplate(req, res, next) {
    try {
      await goalsService.deleteTemplate(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  // --- User Goals ---

  async listUserGoals(req, res, next) {
    try {
      const { user_id, month } = req.query;
      const goals = await goalsService.listUserGoals({ user_id, month });
      res.json(goals);
    } catch (err) {
      next(err);
    }
  }

  async getUserGoal(req, res, next) {
    try {
      const goal = await goalsService.getUserGoalById(req.params.id);
      res.json(goal);
    } catch (err) {
      next(err);
    }
  }

  async createUserGoal(req, res, next) {
    try {
      const { error, value } = createUserGoalSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const goal = await goalsService.createUserGoal(value, req.user.id);
      res.status(201).json(goal);
    } catch (err) {
      next(err);
    }
  }

  async updateUserGoal(req, res, next) {
    try {
      const { error, value } = updateUserGoalSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const goal = await goalsService.updateUserGoal(req.params.id, value);
      res.json(goal);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new GoalsController();
```

**Step 4: Create goals routes**

Create `server/src/modules/goals/goals.routes.js`:

```js
const express = require('express');
const goalsController = require('./goals.controller');
const { authenticate, managementLevel } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

// Goal Templates
router.get('/templates', goalsController.listTemplates.bind(goalsController));
router.get('/templates/:id', goalsController.getTemplate.bind(goalsController));
router.post('/templates', managementLevel, goalsController.createTemplate.bind(goalsController));
router.put('/templates/:id', managementLevel, goalsController.updateTemplate.bind(goalsController));
router.delete('/templates/:id', managementLevel, goalsController.deleteTemplate.bind(goalsController));

// User Goals
router.get('/', goalsController.listUserGoals.bind(goalsController));
router.get('/:id', goalsController.getUserGoal.bind(goalsController));
router.post('/', managementLevel, goalsController.createUserGoal.bind(goalsController));
router.put('/:id', managementLevel, goalsController.updateUserGoal.bind(goalsController));

module.exports = router;
```

**Step 5: Commit**

```bash
git add server/src/modules/goals/
git commit -m "feat: add goals module (templates + user goals CRUD)"
```

---

### Task 2: Clients Module

**Files:**
- Create: `server/src/modules/clients/clients.validation.js`
- Create: `server/src/modules/clients/clients.service.js`
- Create: `server/src/modules/clients/clients.controller.js`
- Create: `server/src/modules/clients/clients.routes.js`

**Step 1: Create clients validation**

Create `server/src/modules/clients/clients.validation.js`:

```js
const Joi = require('joi');

const createClientSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  company: Joi.string().max(100).allow(null, '').optional(),
  instagram_account: Joi.string().max(100).allow(null, '').optional(),
});

const updateClientSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  company: Joi.string().max(100).allow(null, '').optional(),
  instagram_account: Joi.string().max(100).allow(null, '').optional(),
  is_active: Joi.boolean().optional(),
  user_id: Joi.string().uuid().allow(null).optional(),
}).min(1);

module.exports = {
  createClientSchema,
  updateClientSchema,
};
```

**Step 2: Create clients service**

Create `server/src/modules/clients/clients.service.js`:

```js
const db = require('../../config/db');

class ClientsService {
  async list(filters = {}) {
    const query = db('clients').orderBy('name');
    if (filters.is_active !== undefined) query.where('is_active', filters.is_active);
    return query;
  }

  async getById(id) {
    const client = await db('clients').where({ id }).first();
    if (!client) {
      throw Object.assign(new Error('Client not found'), { status: 404 });
    }
    return client;
  }

  async create(data) {
    const [client] = await db('clients').insert(data).returning('*');
    return client;
  }

  async update(id, data) {
    const [updated] = await db('clients')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Client not found'), { status: 404 });
    }
    return updated;
  }

  async getOverages(clientId, filters = {}) {
    const query = db('client_overages')
      .where('client_id', clientId)
      .orderBy('month', 'desc');
    if (filters.month) query.where('month', filters.month);
    if (filters.status) query.where('status', filters.status);
    return query;
  }
}

module.exports = new ClientsService();
```

**Step 3: Create clients controller**

Create `server/src/modules/clients/clients.controller.js`:

```js
const clientsService = require('./clients.service');
const { createClientSchema, updateClientSchema } = require('./clients.validation');

class ClientsController {
  async list(req, res, next) {
    try {
      const { is_active } = req.query;
      const clients = await clientsService.list({ is_active });
      res.json(clients);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const client = await clientsService.getById(req.params.id);
      res.json(client);
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { error, value } = createClientSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const client = await clientsService.create(value);
      res.status(201).json(client);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { error, value } = updateClientSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const client = await clientsService.update(req.params.id, value);
      res.json(client);
    } catch (err) {
      next(err);
    }
  }

  async getOverages(req, res, next) {
    try {
      const { month, status } = req.query;
      const overages = await clientsService.getOverages(req.params.id, { month, status });
      res.json(overages);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new ClientsController();
```

**Step 4: Create clients routes**

Create `server/src/modules/clients/clients.routes.js`:

```js
const express = require('express');
const clientsController = require('./clients.controller');
const { authenticate, managementLevel } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', clientsController.list.bind(clientsController));
router.get('/:id', clientsController.getById.bind(clientsController));
router.post('/', managementLevel, clientsController.create.bind(clientsController));
router.put('/:id', managementLevel, clientsController.update.bind(clientsController));
router.get('/:id/overages', clientsController.getOverages.bind(clientsController));

module.exports = router;
```

**Step 5: Commit**

```bash
git add server/src/modules/clients/
git commit -m "feat: add clients module (CRUD + overages)"
```

---

### Task 3: Plans Module

**Files:**
- Create: `server/src/modules/plans/plans.validation.js`
- Create: `server/src/modules/plans/plans.service.js`
- Create: `server/src/modules/plans/plans.controller.js`
- Create: `server/src/modules/plans/plans.routes.js`

**Step 1: Create plans validation**

Create `server/src/modules/plans/plans.validation.js`:

```js
const Joi = require('joi');

const planLimitItem = Joi.object({
  content_type: Joi.string().required(),
  monthly_limit: Joi.number().integer().min(0).required(),
  overage_price: Joi.number().precision(2).min(0).required(),
});

const createPlanSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().allow(null, '').optional(),
  limits: Joi.array().items(planLimitItem).min(1).required(),
});

const updatePlanSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  description: Joi.string().allow(null, '').optional(),
  is_active: Joi.boolean().optional(),
  limits: Joi.array().items(planLimitItem).min(1).optional(),
}).min(1);

const assignPlanSchema = Joi.object({
  plan_id: Joi.string().uuid().required(),
  starts_at: Joi.date().required(),
  ends_at: Joi.date().allow(null).optional(),
});

module.exports = {
  createPlanSchema,
  updatePlanSchema,
  assignPlanSchema,
};
```

**Step 2: Create plans service**

Create `server/src/modules/plans/plans.service.js`:

```js
const db = require('../../config/db');

class PlansService {
  async list(filters = {}) {
    const query = db('plans').orderBy('name');
    if (filters.is_active !== undefined) query.where('is_active', filters.is_active);
    return query;
  }

  async getById(id) {
    const plan = await db('plans').where({ id }).first();
    if (!plan) {
      throw Object.assign(new Error('Plan not found'), { status: 404 });
    }
    const limits = await db('plan_limits').where({ plan_id: id });
    return { ...plan, limits };
  }

  async create(data) {
    const { limits, ...planData } = data;
    const [plan] = await db('plans').insert(planData).returning('*');

    if (limits && limits.length > 0) {
      const limitRows = limits.map((l) => ({ ...l, plan_id: plan.id }));
      await db('plan_limits').insert(limitRows);
    }

    const savedLimits = await db('plan_limits').where({ plan_id: plan.id });
    return { ...plan, limits: savedLimits };
  }

  async update(id, data) {
    const { limits, ...planData } = data;

    if (Object.keys(planData).length > 0) {
      const [updated] = await db('plans')
        .where({ id })
        .update({ ...planData, updated_at: new Date() })
        .returning('*');
      if (!updated) {
        throw Object.assign(new Error('Plan not found'), { status: 404 });
      }
    }

    if (limits) {
      await db('plan_limits').where({ plan_id: id }).del();
      const limitRows = limits.map((l) => ({ ...l, plan_id: id }));
      await db('plan_limits').insert(limitRows);
    }

    return this.getById(id);
  }

  async deletePlan(id) {
    const deleted = await db('plans').where({ id }).del();
    if (!deleted) {
      throw Object.assign(new Error('Plan not found'), { status: 404 });
    }
  }

  async assignToClient(clientId, data) {
    // Deactivate current plan if any
    await db('client_plans')
      .where({ client_id: clientId, status: 'active' })
      .update({ status: 'cancelled', ends_at: new Date() });

    const [clientPlan] = await db('client_plans')
      .insert({
        client_id: clientId,
        plan_id: data.plan_id,
        starts_at: data.starts_at,
        ends_at: data.ends_at || null,
        status: 'active',
      })
      .returning('*');
    return clientPlan;
  }
}

module.exports = new PlansService();
```

**Step 3: Create plans controller**

Create `server/src/modules/plans/plans.controller.js`:

```js
const plansService = require('./plans.service');
const { createPlanSchema, updatePlanSchema, assignPlanSchema } = require('./plans.validation');

class PlansController {
  async list(req, res, next) {
    try {
      const { is_active } = req.query;
      const plans = await plansService.list({ is_active });
      res.json(plans);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const plan = await plansService.getById(req.params.id);
      res.json(plan);
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { error, value } = createPlanSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const plan = await plansService.create(value);
      res.status(201).json(plan);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { error, value } = updatePlanSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const plan = await plansService.update(req.params.id, value);
      res.json(plan);
    } catch (err) {
      next(err);
    }
  }

  async deletePlan(req, res, next) {
    try {
      await plansService.deletePlan(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }

  async assignToClient(req, res, next) {
    try {
      const { error, value } = assignPlanSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const clientPlan = await plansService.assignToClient(req.params.clientId, value);
      res.status(201).json(clientPlan);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PlansController();
```

**Step 4: Create plans routes**

Create `server/src/modules/plans/plans.routes.js`:

```js
const express = require('express');
const plansController = require('./plans.controller');
const { authenticate, managementLevel } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', plansController.list.bind(plansController));
router.get('/:id', plansController.getById.bind(plansController));
router.post('/', managementLevel, plansController.create.bind(plansController));
router.put('/:id', managementLevel, plansController.update.bind(plansController));
router.delete('/:id', managementLevel, plansController.deletePlan.bind(plansController));
router.post('/clients/:clientId/assign', managementLevel, plansController.assignToClient.bind(plansController));

module.exports = router;
```

**Step 5: Commit**

```bash
git add server/src/modules/plans/
git commit -m "feat: add plans module (CRUD + limits + assign to client)"
```

---

### Task 4: Deliveries Module

**Files:**
- Create: `server/src/modules/deliveries/deliveries.validation.js`
- Create: `server/src/modules/deliveries/deliveries.service.js`
- Create: `server/src/modules/deliveries/deliveries.controller.js`
- Create: `server/src/modules/deliveries/deliveries.routes.js`

**Step 1: Create deliveries validation**

Create `server/src/modules/deliveries/deliveries.validation.js`:

```js
const Joi = require('joi');

const createDeliverySchema = Joi.object({
  user_id: Joi.string().uuid().required(),
  client_id: Joi.string().uuid().required(),
  clickup_task_id: Joi.string().allow(null, '').optional(),
  title: Joi.string().min(2).max(200).required(),
  content_type: Joi.string().required(),
  difficulty: Joi.string().valid('easy', 'medium', 'hard').allow(null).optional(),
  urgency: Joi.string().valid('normal', 'urgent').allow(null).optional(),
  started_at: Joi.date().allow(null).optional(),
  completed_at: Joi.date().allow(null).optional(),
  status: Joi.string().valid('in_progress', 'completed').default('in_progress'),
  month: Joi.date().required(),
});

const updateDeliverySchema = Joi.object({
  title: Joi.string().min(2).max(200).optional(),
  content_type: Joi.string().optional(),
  difficulty: Joi.string().valid('easy', 'medium', 'hard').allow(null).optional(),
  urgency: Joi.string().valid('normal', 'urgent').allow(null).optional(),
  started_at: Joi.date().allow(null).optional(),
  completed_at: Joi.date().allow(null).optional(),
  status: Joi.string().valid('in_progress', 'completed').optional(),
}).min(1);

module.exports = {
  createDeliverySchema,
  updateDeliverySchema,
};
```

**Step 2: Create deliveries service**

Create `server/src/modules/deliveries/deliveries.service.js`:

```js
const db = require('../../config/db');

class DeliveriesService {
  async list(filters = {}) {
    const query = db('deliveries')
      .join('users', 'deliveries.user_id', 'users.id')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .select(
        'deliveries.*',
        'users.name as user_name',
        'clients.name as client_name'
      )
      .orderBy('deliveries.created_at', 'desc');

    if (filters.user_id) query.where('deliveries.user_id', filters.user_id);
    if (filters.client_id) query.where('deliveries.client_id', filters.client_id);
    if (filters.month) query.where('deliveries.month', filters.month);
    if (filters.content_type) query.where('deliveries.content_type', filters.content_type);
    if (filters.status) query.where('deliveries.status', filters.status);
    return query;
  }

  async getById(id) {
    const delivery = await db('deliveries')
      .join('users', 'deliveries.user_id', 'users.id')
      .join('clients', 'deliveries.client_id', 'clients.id')
      .select(
        'deliveries.*',
        'users.name as user_name',
        'clients.name as client_name'
      )
      .where('deliveries.id', id)
      .first();
    if (!delivery) {
      throw Object.assign(new Error('Delivery not found'), { status: 404 });
    }
    return delivery;
  }

  async create(data) {
    const [delivery] = await db('deliveries').insert(data).returning('*');
    return delivery;
  }

  async update(id, data) {
    const [updated] = await db('deliveries')
      .where({ id })
      .update({ ...data, updated_at: new Date() })
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Delivery not found'), { status: 404 });
    }
    return updated;
  }

  async getStats(filters = {}) {
    const query = db('delivery_time_stats').orderBy('period', 'desc');
    if (filters.content_type) query.where('content_type', filters.content_type);
    if (filters.difficulty) query.where('difficulty', filters.difficulty);
    if (filters.period) query.where('period', filters.period);
    return query;
  }
}

module.exports = new DeliveriesService();
```

**Step 3: Create deliveries controller**

Create `server/src/modules/deliveries/deliveries.controller.js`:

```js
const deliveriesService = require('./deliveries.service');
const { createDeliverySchema, updateDeliverySchema } = require('./deliveries.validation');

class DeliveriesController {
  async list(req, res, next) {
    try {
      const { user_id, client_id, month, content_type, status } = req.query;
      const deliveries = await deliveriesService.list({
        user_id, client_id, month, content_type, status,
      });
      res.json(deliveries);
    } catch (err) {
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const delivery = await deliveriesService.getById(req.params.id);
      res.json(delivery);
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      const { error, value } = createDeliverySchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const delivery = await deliveriesService.create(value);
      res.status(201).json(delivery);
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const { error, value } = updateDeliverySchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const delivery = await deliveriesService.update(req.params.id, value);
      res.json(delivery);
    } catch (err) {
      next(err);
    }
  }

  async getStats(req, res, next) {
    try {
      const { content_type, difficulty, period } = req.query;
      const stats = await deliveriesService.getStats({ content_type, difficulty, period });
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new DeliveriesController();
```

**Step 4: Create deliveries routes**

Create `server/src/modules/deliveries/deliveries.routes.js`:

```js
const express = require('express');
const deliveriesController = require('./deliveries.controller');
const { authenticate, managementLevel } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', deliveriesController.list.bind(deliveriesController));
router.get('/stats', deliveriesController.getStats.bind(deliveriesController));
router.get('/:id', deliveriesController.getById.bind(deliveriesController));
router.post('/', managementLevel, deliveriesController.create.bind(deliveriesController));
router.put('/:id', managementLevel, deliveriesController.update.bind(deliveriesController));

module.exports = router;
```

**Step 5: Commit**

```bash
git add server/src/modules/deliveries/
git commit -m "feat: add deliveries module (CRUD + time stats)"
```

---

### Task 5: Calculations Module (J-Curve Logic)

**Files:**
- Create: `server/src/modules/calculations/calculations.validation.js`
- Create: `server/src/modules/calculations/calculations.service.js`
- Create: `server/src/modules/calculations/calculations.controller.js`
- Create: `server/src/modules/calculations/calculations.routes.js`

**Step 1: Create calculations validation**

Create `server/src/modules/calculations/calculations.validation.js`:

```js
const Joi = require('joi');

const suggestSchema = Joi.object({
  month: Joi.date().required(),
  user_ids: Joi.array().items(Joi.string().uuid()).optional(),
});

const adjustSchema = Joi.object({
  final_bonus: Joi.number().precision(2).min(0).required(),
});

module.exports = {
  suggestSchema,
  adjustSchema,
};
```

**Step 2: Create calculations service**

Create `server/src/modules/calculations/calculations.service.js`:

```js
const db = require('../../config/db');

class CalculationsService {
  async list(filters = {}) {
    const query = db('monthly_calculations')
      .join('users', 'monthly_calculations.user_id', 'users.id')
      .select(
        'monthly_calculations.*',
        'users.name as user_name',
        'users.producer_type as user_producer_type'
      )
      .orderBy('monthly_calculations.month', 'desc');

    if (filters.month) query.where('monthly_calculations.month', filters.month);
    if (filters.status) query.where('monthly_calculations.status', filters.status);
    if (filters.user_id) query.where('monthly_calculations.user_id', filters.user_id);
    return query;
  }

  async suggest(month, userIds) {
    // Get users to calculate for
    let usersQuery = db('users')
      .where({ is_active: true, auto_calc_enabled: true })
      .whereNotNull('base_salary')
      .whereIn('role', ['producer']);

    if (userIds && userIds.length > 0) {
      usersQuery = usersQuery.whereIn('id', userIds);
    }

    const users = await usersQuery;
    const results = [];

    for (const user of users) {
      // Get user goal for this month
      const goal = await db('user_goals')
        .where({ user_id: user.id, month })
        .first();

      if (!goal) continue;

      // Count deliveries for this month
      const [{ count }] = await db('deliveries')
        .where({ user_id: user.id, month, status: 'completed' })
        .count('id as count');

      const totalDeliveries = parseInt(count, 10);

      // Get curve config (from goal override or template)
      let curveConfig = goal.curve_config;
      if (!curveConfig && goal.goal_template_id) {
        const template = await db('goal_templates')
          .where({ id: goal.goal_template_id })
          .first();
        curveConfig = template?.curve_config;
      }

      // Calculate multiplier using J-curve
      const multiplier = this._calculateMultiplier(totalDeliveries, curveConfig, goal.multiplier_cap);

      // Calculate bonus
      const suggestedBonus = parseFloat((user.base_salary * multiplier).toFixed(2));

      // Upsert calculation
      const existing = await db('monthly_calculations')
        .where({ user_id: user.id, month })
        .first();

      let calc;
      if (existing) {
        [calc] = await db('monthly_calculations')
          .where({ id: existing.id })
          .update({
            total_deliveries: totalDeliveries,
            base_salary: user.base_salary,
            suggested_bonus: suggestedBonus,
            multiplier_applied: multiplier,
            status: 'calculated',
            calculated_at: new Date(),
            updated_at: new Date(),
          })
          .returning('*');
      } else {
        [calc] = await db('monthly_calculations')
          .insert({
            user_id: user.id,
            month,
            total_deliveries: totalDeliveries,
            base_salary: user.base_salary,
            suggested_bonus: suggestedBonus,
            multiplier_applied: multiplier,
            status: 'calculated',
            calculated_at: new Date(),
          })
          .returning('*');
      }

      results.push(calc);
    }

    return results;
  }

  _calculateMultiplier(deliveries, curveConfig, multiplierCap) {
    if (!curveConfig || !curveConfig.levels) return 0;

    let multiplier = 0;
    for (const level of curveConfig.levels) {
      if (deliveries >= level.from && (level.to === null || deliveries <= level.to)) {
        multiplier = level.multiplier;
        break;
      }
    }

    if (multiplierCap && multiplier > multiplierCap) {
      multiplier = multiplierCap;
    }

    return multiplier;
  }

  async adjust(id, finalBonus) {
    const [updated] = await db('monthly_calculations')
      .where({ id })
      .update({
        final_bonus: finalBonus,
        status: 'adjusted',
        updated_at: new Date(),
      })
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Calculation not found'), { status: 404 });
    }
    return updated;
  }

  async close(id, closedBy) {
    const [updated] = await db('monthly_calculations')
      .where({ id })
      .update({
        status: 'closed',
        closed_by: closedBy,
        closed_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Calculation not found'), { status: 404 });
    }
    return updated;
  }

  async closeAll(month, closedBy) {
    const updated = await db('monthly_calculations')
      .where({ month })
      .whereIn('status', ['calculated', 'adjusted'])
      .update({
        status: 'closed',
        closed_by: closedBy,
        closed_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');
    return updated;
  }
}

module.exports = new CalculationsService();
```

**Step 3: Create calculations controller**

Create `server/src/modules/calculations/calculations.controller.js`:

```js
const calculationsService = require('./calculations.service');
const { suggestSchema, adjustSchema } = require('./calculations.validation');

class CalculationsController {
  async list(req, res, next) {
    try {
      const { month, status, user_id } = req.query;
      const calcs = await calculationsService.list({ month, status, user_id });
      res.json(calcs);
    } catch (err) {
      next(err);
    }
  }

  async suggest(req, res, next) {
    try {
      const { error, value } = suggestSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const results = await calculationsService.suggest(value.month, value.user_ids);
      res.json(results);
    } catch (err) {
      next(err);
    }
  }

  async adjust(req, res, next) {
    try {
      const { error, value } = adjustSchema.validate(req.body);
      if (error) return res.status(400).json({ error: error.details[0].message });

      const calc = await calculationsService.adjust(req.params.id, value.final_bonus);
      res.json(calc);
    } catch (err) {
      next(err);
    }
  }

  async close(req, res, next) {
    try {
      const calc = await calculationsService.close(req.params.id, req.user.id);
      res.json(calc);
    } catch (err) {
      next(err);
    }
  }

  async closeAll(req, res, next) {
    try {
      const { month } = req.body;
      if (!month) return res.status(400).json({ error: 'Month is required' });

      const calcs = await calculationsService.closeAll(month, req.user.id);
      res.json(calcs);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CalculationsController();
```

**Step 4: Create calculations routes**

Create `server/src/modules/calculations/calculations.routes.js`:

```js
const express = require('express');
const calculationsController = require('./calculations.controller');
const { authenticate, adminLevel, ceoOnly } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', adminLevel, calculationsController.list.bind(calculationsController));
router.post('/suggest', adminLevel, calculationsController.suggest.bind(calculationsController));
router.put('/:id', adminLevel, calculationsController.adjust.bind(calculationsController));
router.patch('/:id/close', ceoOnly, calculationsController.close.bind(calculationsController));
router.patch('/close-all', ceoOnly, calculationsController.closeAll.bind(calculationsController));

module.exports = router;
```

**Step 5: Commit**

```bash
git add server/src/modules/calculations/
git commit -m "feat: add calculations module (J-curve suggest, adjust, close)"
```

---

### Task 6: Settings Module

**Files:**
- Create: `server/src/modules/settings/settings.service.js`
- Create: `server/src/modules/settings/settings.controller.js`
- Create: `server/src/modules/settings/settings.routes.js`

**Step 1: Create settings service**

Create `server/src/modules/settings/settings.service.js`:

```js
const db = require('../../config/db');

class SettingsService {
  async listSettings() {
    return db('app_settings').orderBy('key');
  }

  async getSetting(key) {
    const setting = await db('app_settings').where({ key }).first();
    if (!setting) {
      throw Object.assign(new Error('Setting not found'), { status: 404 });
    }
    return setting;
  }

  async updateSetting(key, value, updatedBy) {
    const [updated] = await db('app_settings')
      .where({ key })
      .update({
        value: JSON.stringify(value),
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Setting not found'), { status: 404 });
    }
    return updated;
  }

  async listIntegrations() {
    return db('integrations').orderBy('type');
  }

  async updateIntegration(id, config, isActive) {
    const updateData = { updated_at: new Date() };
    if (config !== undefined) updateData.config = JSON.stringify(config);
    if (isActive !== undefined) updateData.is_active = isActive;

    const [updated] = await db('integrations')
      .where({ id })
      .update(updateData)
      .returning('*');
    if (!updated) {
      throw Object.assign(new Error('Integration not found'), { status: 404 });
    }
    return updated;
  }
}

module.exports = new SettingsService();
```

**Step 2: Create settings controller**

Create `server/src/modules/settings/settings.controller.js`:

```js
const settingsService = require('./settings.service');

class SettingsController {
  async listSettings(req, res, next) {
    try {
      const settings = await settingsService.listSettings();
      res.json(settings);
    } catch (err) {
      next(err);
    }
  }

  async updateSetting(req, res, next) {
    try {
      const { value } = req.body;
      if (value === undefined) return res.status(400).json({ error: 'Value is required' });

      const setting = await settingsService.updateSetting(req.params.key, value, req.user.id);
      res.json(setting);
    } catch (err) {
      next(err);
    }
  }

  async listIntegrations(req, res, next) {
    try {
      const integrations = await settingsService.listIntegrations();
      res.json(integrations);
    } catch (err) {
      next(err);
    }
  }

  async updateIntegration(req, res, next) {
    try {
      const { config, is_active } = req.body;
      const integration = await settingsService.updateIntegration(req.params.id, config, is_active);
      res.json(integration);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SettingsController();
```

**Step 3: Create settings routes**

Create `server/src/modules/settings/settings.routes.js`:

```js
const express = require('express');
const settingsController = require('./settings.controller');
const { authenticate, ceoOnly } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', settingsController.listSettings.bind(settingsController));
router.put('/:key', ceoOnly, settingsController.updateSetting.bind(settingsController));

router.get('/integrations', settingsController.listIntegrations.bind(settingsController));
router.put('/integrations/:id', ceoOnly, settingsController.updateIntegration.bind(settingsController));

module.exports = router;
```

**Step 4: Commit**

```bash
git add server/src/modules/settings/
git commit -m "feat: add settings module (app settings + integrations)"
```

---

### Task 7: Ranking & Simulator Modules

**Files:**
- Create: `server/src/modules/ranking/ranking.service.js`
- Create: `server/src/modules/ranking/ranking.controller.js`
- Create: `server/src/modules/ranking/ranking.routes.js`
- Create: `server/src/modules/simulator/simulator.service.js`
- Create: `server/src/modules/simulator/simulator.controller.js`
- Create: `server/src/modules/simulator/simulator.routes.js`

**Step 1: Create ranking service**

Create `server/src/modules/ranking/ranking.service.js`:

```js
const db = require('../../config/db');

class RankingService {
  async getRanking(month) {
    const ranking = await db('monthly_calculations')
      .join('users', 'monthly_calculations.user_id', 'users.id')
      .where('monthly_calculations.month', month)
      .select(
        'users.id',
        'users.name',
        'users.avatar_url',
        'users.producer_type',
        'monthly_calculations.total_deliveries',
        'monthly_calculations.multiplier_applied',
        'monthly_calculations.suggested_bonus',
        'monthly_calculations.final_bonus',
        'monthly_calculations.status'
      )
      .orderBy('monthly_calculations.total_deliveries', 'desc');

    // Check if names should be shown
    const showNames = await db('app_settings')
      .where({ key: 'ranking_show_names' })
      .first();

    const shouldShowNames = showNames ? JSON.parse(showNames.value) : true;

    return ranking.map((entry, index) => ({
      position: index + 1,
      ...entry,
      name: shouldShowNames ? entry.name : `Produtor ${index + 1}`,
      avatar_url: shouldShowNames ? entry.avatar_url : null,
    }));
  }

  async getHistory(userId, limit = 6) {
    return db('monthly_calculations')
      .where({ user_id: userId })
      .orderBy('month', 'desc')
      .limit(limit);
  }
}

module.exports = new RankingService();
```

**Step 2: Create ranking controller + routes**

Create `server/src/modules/ranking/ranking.controller.js`:

```js
const rankingService = require('./ranking.service');

class RankingController {
  async getRanking(req, res, next) {
    try {
      const { month } = req.query;
      if (!month) return res.status(400).json({ error: 'Month query param is required' });

      const ranking = await rankingService.getRanking(month);
      res.json(ranking);
    } catch (err) {
      next(err);
    }
  }

  async getHistory(req, res, next) {
    try {
      const userId = req.params.userId || req.user.id;
      const history = await rankingService.getHistory(userId);
      res.json(history);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new RankingController();
```

Create `server/src/modules/ranking/ranking.routes.js`:

```js
const express = require('express');
const rankingController = require('./ranking.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', rankingController.getRanking.bind(rankingController));
router.get('/history', rankingController.getHistory.bind(rankingController));
router.get('/history/:userId', rankingController.getHistory.bind(rankingController));

module.exports = router;
```

**Step 3: Create simulator service**

Create `server/src/modules/simulator/simulator.service.js`:

```js
const db = require('../../config/db');

class SimulatorService {
  async getData(userId, month) {
    const user = await db('users').where({ id: userId }).first();
    if (!user) {
      throw Object.assign(new Error('User not found'), { status: 404 });
    }

    const goal = await db('user_goals').where({ user_id: userId, month }).first();

    let curveConfig = goal?.curve_config;
    if (!curveConfig && goal?.goal_template_id) {
      const template = await db('goal_templates')
        .where({ id: goal.goal_template_id })
        .first();
      curveConfig = template?.curve_config;
    }

    const [{ count }] = await db('deliveries')
      .where({ user_id: userId, month, status: 'completed' })
      .count('id as count');

    return {
      base_salary: user.base_salary,
      current_deliveries: parseInt(count, 10),
      monthly_target: goal?.monthly_target || null,
      multiplier_cap: goal?.multiplier_cap || null,
      curve_config: curveConfig,
    };
  }

  async calculate(baseSalary, deliveries, curveConfig, multiplierCap) {
    if (!curveConfig || !curveConfig.levels) {
      return { multiplier: 0, bonus: 0 };
    }

    let multiplier = 0;
    for (const level of curveConfig.levels) {
      if (deliveries >= level.from && (level.to === null || deliveries <= level.to)) {
        multiplier = level.multiplier;
        break;
      }
    }

    if (multiplierCap && multiplier > multiplierCap) {
      multiplier = multiplierCap;
    }

    const bonus = parseFloat((baseSalary * multiplier).toFixed(2));
    return { multiplier, bonus };
  }
}

module.exports = new SimulatorService();
```

**Step 4: Create simulator controller + routes**

Create `server/src/modules/simulator/simulator.controller.js`:

```js
const simulatorService = require('./simulator.service');

class SimulatorController {
  async getData(req, res, next) {
    try {
      const { month } = req.query;
      if (!month) return res.status(400).json({ error: 'Month query param is required' });

      const data = await simulatorService.getData(req.user.id, month);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  async calculate(req, res, next) {
    try {
      const { base_salary, deliveries, curve_config, multiplier_cap } = req.body;
      if (!base_salary || deliveries === undefined || !curve_config) {
        return res.status(400).json({ error: 'base_salary, deliveries, and curve_config are required' });
      }

      const result = await simulatorService.calculate(
        base_salary, deliveries, curve_config, multiplier_cap
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SimulatorController();
```

Create `server/src/modules/simulator/simulator.routes.js`:

```js
const express = require('express');
const simulatorController = require('./simulator.controller');
const { authenticate } = require('../../middleware/auth');

const router = express.Router();

router.use(authenticate);

router.get('/', simulatorController.getData.bind(simulatorController));
router.post('/calculate', simulatorController.calculate.bind(simulatorController));

module.exports = router;
```

**Step 5: Commit**

```bash
git add server/src/modules/ranking/ server/src/modules/simulator/
git commit -m "feat: add ranking and simulator modules"
```

---

### Task 8: Wire All New Modules into app.js

**Files:**
- Modify: `server/src/app.js`

**Step 1: Update app.js to register all new routes**

Add the following imports after the existing route imports in `server/src/app.js`:

```js
const goalsRoutes = require('./modules/goals/goals.routes');
const clientsRoutes = require('./modules/clients/clients.routes');
const plansRoutes = require('./modules/plans/plans.routes');
const deliveriesRoutes = require('./modules/deliveries/deliveries.routes');
const calculationsRoutes = require('./modules/calculations/calculations.routes');
const settingsRoutes = require('./modules/settings/settings.routes');
const rankingRoutes = require('./modules/ranking/ranking.routes');
const simulatorRoutes = require('./modules/simulator/simulator.routes');
```

Add routes after the existing `app.use` lines:

```js
app.use('/api/goals', goalsRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/deliveries', deliveriesRoutes);
app.use('/api/calculations', calculationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/simulator', simulatorRoutes);
```

**Step 2: Verify server starts**

Run: `cd server && PORT=4567 node src/app.js`
Expected: "Server running on port 4567 [development]"

Test: `curl -s http://localhost:4567/api/health`
Expected: `{"status":"ok","db":"connected",...}`

**Step 3: Commit**

```bash
git add server/src/app.js
git commit -m "feat: wire all Phase 2 backend modules into Express app"
```

---

### Task 9: Frontend — API Layer + Auth Store

**Files:**
- Create: `client/src/services/api.js`
- Create: `client/src/stores/authStore.js`

**Step 1: Create API service with Axios interceptors**

Create `client/src/services/api.js`:

```js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach access token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — handle 401 + auto-refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post('/api/auth/refresh', { refreshToken });

        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
```

**Step 2: Create auth Zustand store**

Create `client/src/stores/authStore.js`:

```js
import { create } from 'zustand';
import api from '../services/api';

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user, isAuthenticated: true });
    return data;
  },

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false });
  },

  loadUser: async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const { data } = await api.get('/auth/me');
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) => set({ user, isAuthenticated: true }),
}));

export default useAuthStore;
```

**Step 3: Commit**

```bash
git add client/src/services/ client/src/stores/
git commit -m "feat: add API layer with Axios interceptors + auth Zustand store"
```

---

### Task 10: Frontend — Login Page

**Files:**
- Create: `client/src/pages/LoginPage.jsx`

**Step 1: Create login page**

Create `client/src/pages/LoginPage.jsx`:

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import useAuthStore from '@/stores/authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold" style={{ color: '#9A48EA' }}>
            TasksLudus
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Entre na sua conta</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-muted-foreground">ou</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => (window.location.href = '/api/auth/google')}
            >
              Entrar com Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add client/src/pages/
git commit -m "feat: add login page"
```

---

### Task 11: Frontend — Invite Accept Page + Auth Callback

**Files:**
- Create: `client/src/pages/InviteAcceptPage.jsx`
- Create: `client/src/pages/AuthCallbackPage.jsx`

**Step 1: Create invite accept page**

Create `client/src/pages/InviteAcceptPage.jsx`:

```jsx
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import api from '@/services/api';
import useAuthStore from '@/stores/authStore';

export default function InviteAcceptPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post(`/auth/invites/${token}/accept`, { name, password });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      setUser(data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to accept invite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold" style={{ color: '#9A48EA' }}>
            TasksLudus
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">Crie sua conta</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Nome</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Criando conta...' : 'Criar conta'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: Create auth callback page (Google OAuth redirect handler)**

Create `client/src/pages/AuthCallbackPage.jsx`:

```jsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');

    if (accessToken && refreshToken) {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      loadUser().then(() => navigate('/dashboard'));
    } else {
      navigate('/login');
    }
  }, [searchParams, navigate, loadUser]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-muted-foreground">Autenticando...</p>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add client/src/pages/
git commit -m "feat: add invite accept page and Google OAuth callback"
```

---

### Task 12: Frontend — Layout (Sidebar + Route Guards)

**Files:**
- Create: `client/src/components/layout/Sidebar.jsx`
- Create: `client/src/components/layout/AuthLayout.jsx`
- Create: `client/src/components/layout/ProtectedRoute.jsx`

**Step 1: Create sidebar**

Create `client/src/components/layout/Sidebar.jsx`:

```jsx
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Target, Calculator, Package,
  BarChart3, TrendingUp, Sliders, LogOut, Trophy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import useAuthStore from '@/stores/authStore';

const navItems = {
  ceo: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Usuarios' },
    { to: '/goals', icon: Target, label: 'Metas' },
    { to: '/calculations', icon: Calculator, label: 'Calculos' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
    { to: '/settings', icon: Sliders, label: 'Config' },
  ],
  director: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Usuarios' },
    { to: '/goals', icon: Target, label: 'Metas' },
    { to: '/calculations', icon: Calculator, label: 'Calculos' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
  manager: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/users', icon: Users, label: 'Usuarios' },
    { to: '/goals', icon: Target, label: 'Metas' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
  account_manager: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/clients', icon: Package, label: 'Clientes' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
  ],
  producer: [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/deliveries', icon: BarChart3, label: 'Entregas' },
    { to: '/simulator', icon: TrendingUp, label: 'Simulador' },
    { to: '/ranking', icon: Trophy, label: 'Ranking' },
  ],
  client: [
    { to: '/portal', icon: LayoutDashboard, label: 'Portal' },
  ],
};

export default function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const items = navItems[user?.role] || [];
  const initials = user?.name?.split(' ').map((n) => n[0]).join('').slice(0, 2) || '?';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside className="w-60 h-screen bg-white border-r flex flex-col">
      <div className="p-4">
        <h1 className="text-lg font-bold" style={{ color: '#9A48EA' }}>TasksLudus</h1>
      </div>

      <Separator />

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-purple-50 text-purple-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <Separator />

      <div className="p-3 flex items-center gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user?.avatar_url} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.role}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
          <LogOut size={16} />
        </Button>
      </div>
    </aside>
  );
}
```

**Step 2: Create authenticated layout**

Create `client/src/components/layout/AuthLayout.jsx`:

```jsx
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function AuthLayout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50 p-6">
        <Outlet />
      </main>
    </div>
  );
}
```

**Step 3: Create protected route guard**

Create `client/src/components/layout/ProtectedRoute.jsx`:

```jsx
import { Navigate } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';

export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
```

**Step 4: Commit**

```bash
git add client/src/components/layout/
git commit -m "feat: add sidebar layout, auth layout, and protected route guard"
```

---

### Task 13: Frontend — App Router + Dashboard Shell

**Files:**
- Create: `client/src/pages/DashboardPage.jsx`
- Modify: `client/src/App.jsx`

**Step 1: Create dashboard placeholder**

Create `client/src/pages/DashboardPage.jsx`:

```jsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import useAuthStore from '@/stores/authStore';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Bem-vindo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">{user?.name}</p>
            <p className="text-sm text-muted-foreground capitalize">{user?.role}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Entregas do Mes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" style={{ color: '#9A48EA' }}>—</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Bonus Estimado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold" style={{ color: '#2D8A56' }}>—</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**Step 2: Update App.jsx with full routing**

Replace `client/src/App.jsx`:

```jsx
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from '@/stores/authStore';
import AuthLayout from '@/components/layout/AuthLayout';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import LoginPage from '@/pages/LoginPage';
import InviteAcceptPage from '@/pages/InviteAcceptPage';
import AuthCallbackPage from '@/pages/AuthCallbackPage';
import DashboardPage from '@/pages/DashboardPage';

function App() {
  const loadUser = useAuthStore((s) => s.loadUser);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <AuthLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>

        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

**Step 3: Install react-router-dom if not already**

Run: `cd client && npm ls react-router-dom`
If not installed: `cd client && npm install react-router-dom`

**Step 4: Verify client builds**

Run: `cd client && npm run build`
Expected: Build succeeds without errors.

**Step 5: Commit**

```bash
git add client/src/
git commit -m "feat: add app router with dashboard shell and auth flow"
```

---

## Summary

| Task | What | Phase |
|------|------|-------|
| 1 | Goals module (templates + user goals) | 2 Backend |
| 2 | Clients module (CRUD + overages) | 2 Backend |
| 3 | Plans module (CRUD + limits + assign) | 2 Backend |
| 4 | Deliveries module (CRUD + stats) | 2 Backend |
| 5 | Calculations module (J-curve suggest/adjust/close) | 2 Backend |
| 6 | Settings module (app settings + integrations) | 2 Backend |
| 7 | Ranking & Simulator modules | 2 Backend |
| 8 | Wire all modules into app.js | 2 Backend |
| 9 | Frontend API layer + Auth store | 2 Frontend |
| 10 | Login page | 2 Frontend |
| 11 | Invite accept + Auth callback pages | 2 Frontend |
| 12 | Sidebar layout + Protected route | 2 Frontend |
| 13 | App router + Dashboard shell | 2 Frontend |

**Entregavel Phase 2:** All backend API modules functional (goals, clients, plans, deliveries, calculations, settings, ranking, simulator). Frontend with login, Google OAuth callback, invite accept, role-based sidebar, and dashboard placeholder. Full auth flow working end-to-end.
