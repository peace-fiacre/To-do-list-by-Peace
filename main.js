import './style.css'

// Gestionnaire d'authentification
class AuthManager {
  constructor() {
    this.activeUser = null
    this.init()
  }

  init() {
    this.checkAuth()
    this.setupAuthListeners()
  }

  async hashPassword(password) {
    const encoder = new TextEncoder()
    const data = encoder.encode(password)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  setupAuthListeners() {
    const loginTab = document.getElementById('login-tab')
    const registerTab = document.getElementById('register-tab')
    const authSubmit = document.getElementById('auth-submit')
    const usernameInput = document.getElementById('auth-username')
    const passwordInput = document.getElementById('auth-password')

    loginTab.addEventListener('click', () => this.switchToLogin())
    registerTab.addEventListener('click', () => this.switchToRegister())
    
    authSubmit.addEventListener('click', () => this.handleAuth())
    
    // Entrée pour soumettre
    usernameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleAuth()
    })
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleAuth()
    })
  }

  switchToLogin() {
    document.getElementById('login-tab').classList.add('active')
    document.getElementById('register-tab').classList.remove('active')
    document.getElementById('auth-submit').textContent = 'Se connecter'
    this.hideError()
  }

  switchToRegister() {
    document.getElementById('register-tab').classList.add('active')
    document.getElementById('login-tab').classList.remove('active')
    document.getElementById('auth-submit').textContent = "S'inscrire"
    this.hideError()
  }

  async handleAuth() {
    const username = document.getElementById('auth-username').value.trim()
    const password = document.getElementById('auth-password').value
    const isRegisterMode = document.getElementById('register-tab').classList.contains('active')

    if (!username || !password) {
      this.showError('Veuillez remplir tous les champs')
      return
    }

    if (isRegisterMode) {
      await this.register(username, password)
    } else {
      await this.login(username, password)
    }
  }

  async register(username, password) {
    const users = this.getUsers()
    
    if (users[username]) {
      this.showError('Ce nom d\'utilisateur existe déjà')
      return
    }

    const hashedPassword = await this.hashPassword(password)
    users[username] = hashedPassword
    this.saveUsers(users)
    
    this.showError('Inscription réussie ! Vous pouvez maintenant vous connecter.', 'success')
    this.switchToLogin()
    document.getElementById('auth-username').value = username
    document.getElementById('auth-password').value = ''
  }

  async login(username, password) {
    const users = this.getUsers()
    
    if (!users[username]) {
      this.showError('Nom d\'utilisateur ou mot de passe incorrect')
      return
    }

    const hashedPassword = await this.hashPassword(password)
    
    if (users[username] !== hashedPassword) {
      this.showError('Nom d\'utilisateur ou mot de passe incorrect')
      return
    }

    this.activeUser = username
    localStorage.setItem('activeUser', username)
    this.showApp()
    
    // Initialiser l'app après connexion
    if (window.todoApp) {
      window.todoApp.tasks = window.todoApp.loadTasks()
      window.todoApp.render()
    } else {
      window.todoApp = new TodoApp(this)
    }
  }

  checkAuth() {
    const activeUser = localStorage.getItem('activeUser')
    if (activeUser) {
      this.activeUser = activeUser
      this.showApp()
    } else {
      this.showAuthScreen()
    }
  }

  logout() {
    localStorage.removeItem('activeUser')
    this.activeUser = null
    this.showAuthScreen()
  }

  getActiveUser() {
    return this.activeUser
  }

  getUsers() {
    const users = localStorage.getItem('users')
    return users ? JSON.parse(users) : {}
  }

  saveUsers(users) {
    localStorage.setItem('users', JSON.stringify(users))
  }

  showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'flex'
    document.getElementById('app').style.display = 'none'
    document.getElementById('auth-username').value = ''
    document.getElementById('auth-password').value = ''
    this.hideError()
  }

  showApp() {
    document.getElementById('auth-screen').style.display = 'none'
    document.getElementById('app').style.display = 'block'
    document.getElementById('current-user').textContent = `👤 ${this.activeUser}`
  }

  showError(message, type = 'error') {
    const errorDiv = document.getElementById('auth-error')
    errorDiv.textContent = message
    errorDiv.style.display = 'block'
    errorDiv.style.background = type === 'success' ? 'var(--success-color)' : 'var(--danger-color)'
  }

  hideError() {
    document.getElementById('auth-error').style.display = 'none'
  }
}

class TodoApp {
  constructor(authManager) {
    this.authManager = authManager
    this.tasks = this.loadTasks()
    this.currentEditId = null
    this.draggedElement = null
    this.notificationIntervals = []
    this.pendingSubtasks = [] // Sous-tâches en attente d'ajout lors de la création
    this.init()
  }

  init() {
    this.setupEventListeners()
    this.loadTheme()
    this.render()
    this.requestNotificationPermission()
    this.checkNotifications()
    // Vérifier les notifications toutes les minutes
    setInterval(() => this.checkNotifications(), 60000)
    
    // Backup automatique quotidien
    this.setupAutoBackup()
  }

  setupAutoBackup() {
    const lastBackupDate = localStorage.getItem('lastBackupDate')
    const today = new Date().toISOString().split('T')[0]
    
    // Faire un backup si c'est un nouveau jour
    if (lastBackupDate !== today) {
      this.createAutoBackup()
      localStorage.setItem('lastBackupDate', today)
    }

    // Vérifier chaque jour à minuit
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    const msUntilMidnight = tomorrow.getTime() - now.getTime()
    
    setTimeout(() => {
      this.createAutoBackup()
      localStorage.setItem('lastBackupDate', new Date().toISOString().split('T')[0])
      // Programmer le prochain backup (24h)
      setInterval(() => {
        this.createAutoBackup()
        localStorage.setItem('lastBackupDate', new Date().toISOString().split('T')[0])
      }, 24 * 60 * 60 * 1000)
    }, msUntilMidnight)
  }

  createAutoBackup() {
    const username = this.authManager.getActiveUser()
    if (!username) return

    const backupData = {
      date: new Date().toISOString(),
      tasks: this.tasks,
      version: '1.0'
    }

    const backupKey = `backup_${username}_${new Date().toISOString().split('T')[0]}`
    localStorage.setItem(backupKey, JSON.stringify(backupData))

    // Garder seulement les 7 derniers backups
    this.cleanOldBackups(username)
  }

  cleanOldBackups(username) {
    const backupKeys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(`backup_${username}_`)) {
        backupKeys.push(key)
      }
    }

    // Trier par date (plus récent en premier)
    backupKeys.sort().reverse()

    // Supprimer les backups au-delà de 7 jours
    if (backupKeys.length > 7) {
      backupKeys.slice(7).forEach(key => {
        localStorage.removeItem(key)
      })
    }
  }

  restoreFromBackup(username, backupDate) {
    const backupKey = `backup_${username}_${backupDate}`
    const backupData = localStorage.getItem(backupKey)
    
    if (backupData) {
      try {
        const backup = JSON.parse(backupData)
        if (confirm(`Restaurer le backup du ${new Date(backup.date).toLocaleDateString('fr-FR')} ?\n\nCette action remplacera vos tâches actuelles.`)) {
          this.tasks = backup.tasks || []
          this.saveTasks()
          this.render()
          alert('Backup restauré avec succès !')
        }
      } catch (e) {
        alert('Erreur lors de la restauration du backup.')
      }
    }
  }

  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'denied') {
          console.warn('Les notifications ont été refusées')
        }
      })
    }
  }

  setupEventListeners() {
    // Déconnexion
    document.getElementById('logout-btn').addEventListener('click', () => {
      if (confirm('Voulez-vous vous déconnecter ?')) {
        this.authManager.logout()
      }
    })

    // Tâches
    document.getElementById('add-task-btn').addEventListener('click', () => this.addTask())
    document.getElementById('task-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addTask()
    })

    // Gestion de la description lors de la création
    const toggleDescriptionBtn = document.getElementById('toggle-description')
    if (toggleDescriptionBtn) {
      toggleDescriptionBtn.addEventListener('click', () => this.toggleDescriptionSection())
    }

    // Gestion des sous-tâches lors de la création
    const toggleSubtasksBtn = document.getElementById('toggle-subtasks')
    const addSubtaskBtn = document.getElementById('add-subtask-btn')
    const newSubtaskInput = document.getElementById('new-subtask-input')
    
    if (toggleSubtasksBtn) {
      toggleSubtasksBtn.addEventListener('click', () => this.toggleSubtasksSection())
    }
    if (addSubtaskBtn) {
      addSubtaskBtn.addEventListener('click', () => this.addPendingSubtask())
    }
    if (newSubtaskInput) {
      newSubtaskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.addPendingSubtask()
      })
    }

    // Interface
    document.getElementById('compact-toggle').addEventListener('click', () => this.toggleCompactMode())
    document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme())
    document.getElementById('stats-btn').addEventListener('click', () => this.showStats())

    // Filtres et recherche
    document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e.target.value))
    document.getElementById('filter-status').addEventListener('change', () => this.render())
    document.getElementById('filter-category').addEventListener('change', () => this.render())
    document.getElementById('sort-by').addEventListener('change', () => this.render())

    // Import/Export
    document.getElementById('export-json').addEventListener('click', () => this.exportJSON())
    document.getElementById('export-csv').addEventListener('click', () => this.exportCSV())
    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click())
    document.getElementById('import-file').addEventListener('change', (e) => this.importFile(e))
    document.getElementById('backup-btn').addEventListener('click', () => this.showBackups())

    // Modales
    document.querySelectorAll('.close-modal').forEach(btn => {
      btn.addEventListener('click', () => this.closeModals())
    })

    document.getElementById('save-edit').addEventListener('click', () => this.saveEdit())
    document.getElementById('edit-recurring').addEventListener('change', (e) => {
      document.getElementById('edit-recurrence').style.display = e.target.checked ? 'block' : 'none'
    })

    window.addEventListener('click', (e) => {
      const statsModal = document.getElementById('stats-modal')
      const editModal = document.getElementById('edit-modal')
      const backupModal = document.getElementById('backup-modal')
      if (e.target === statsModal) statsModal.classList.remove('active')
      if (e.target === editModal) editModal.classList.remove('active')
      if (e.target === backupModal) backupModal.classList.remove('active')
    })
  }

  loadTasks() {
    const username = this.authManager.getActiveUser()
    if (!username) return []
    const saved = localStorage.getItem(`tasks_${username}`)
    const tasks = saved ? JSON.parse(saved) : []
    
    // Migration : initialiser notificationsSent, startDate et description pour les tâches existantes
    let needsSave = false
    tasks.forEach(task => {
      if (!task.notificationsSent) {
        task.notificationsSent = { '24h': false, '1h': false }
        needsSave = true
      }
      if (!task.hasOwnProperty('startDate')) {
        task.startDate = null
        needsSave = true
      }
      if (!task.hasOwnProperty('description')) {
        task.description = null
        needsSave = true
      }
      if (!task.hasOwnProperty('reminders')) {
        task.reminders = {
          '1week': false,
          '3days': false,
          '24h': true,
          '1h': true,
          'start': false
        }
        needsSave = true
      }
      // Migrer notificationsSent pour inclure les nouveaux champs
      if (!task.notificationsSent['1week']) {
        task.notificationsSent['1week'] = false
        task.notificationsSent['3days'] = false
        task.notificationsSent['start'] = false
        needsSave = true
      }
    })
    
    // Sauvegarder si migration nécessaire
    if (needsSave && tasks.length > 0) {
      localStorage.setItem(`tasks_${username}`, JSON.stringify(tasks))
    }
    
    return tasks
  }

  saveTasks() {
    const username = this.authManager.getActiveUser()
    if (!username) return
    localStorage.setItem(`tasks_${username}`, JSON.stringify(this.tasks))
  }

  loadTheme() {
    const theme = localStorage.getItem('theme') || 'light'
    document.body.setAttribute('data-theme', theme)
    this.updateThemeIcon(theme)
    
    // Charger le mode compact
    const isCompact = localStorage.getItem('compactMode') === 'true'
    if (isCompact) {
      document.body.classList.add('compact-mode')
      this.updateCompactIcon(true)
    }
  }

  toggleTheme() {
    const currentTheme = document.body.getAttribute('data-theme')
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark'
    document.body.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
    this.updateThemeIcon(newTheme)
  }

  updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-icon')
    if (icon) {
      icon.textContent = theme === 'dark' ? '☀️' : '🌙'
    }
  }

  toggleCompactMode() {
    const isCompact = document.body.classList.toggle('compact-mode')
    localStorage.setItem('compactMode', isCompact)
    this.updateCompactIcon(isCompact)
    this.render()
  }

  updateCompactIcon(isCompact) {
    const icon = document.getElementById('compact-icon')
    if (icon) {
      icon.textContent = isCompact ? '📃' : '📄'
    }
  }

  addTask() {
    const input = document.getElementById('task-input')
    const title = input.value.trim()

    if (!title) return

    // Préparer les sous-tâches avec des IDs uniques
    const subtasks = this.pendingSubtasks.map((st, index) => ({
      id: Date.now() + index * 1000 + Math.random(),
      title: st,
      completed: false
    }))

    // Récupérer la description
    const description = document.getElementById('task-description-input')?.value.trim() || null

    const task = {
      id: Date.now(),
      title,
      description: description,
      completed: false,
      priority: document.getElementById('priority-select').value,
      category: document.getElementById('category-input').value.trim() || 'Général',
      startDate: document.getElementById('start-date-input').value || null,
      dueDate: document.getElementById('due-date-input').value || null,
      createdAt: new Date().toISOString(),
      subtasks: subtasks,
      pinned: false,
      recurring: false,
      recurrence: null,
      notificationsSent: {
        '1week': false,
        '3days': false,
        '24h': false,
        '1h': false,
        'start': false
      },
      reminders: {
        '1week': false,
        '3days': false,
        '24h': true,
        '1h': true,
        'start': false
      }
    }

    this.tasks.unshift(task)
    this.saveTasks()
    this.render()
    this.scheduleNotifications(task)

    // Réinitialiser le formulaire
    input.value = ''
    document.getElementById('category-input').value = ''
    document.getElementById('start-date-input').value = ''
    document.getElementById('due-date-input').value = ''
    document.getElementById('priority-select').value = 'medium'
    
    // Réinitialiser la description
    const descriptionInput = document.getElementById('task-description-input')
    if (descriptionInput) {
      descriptionInput.value = ''
      document.getElementById('description-container').style.display = 'none'
    }
    
    // Réinitialiser les sous-tâches en attente
    this.clearPendingSubtasks()
  }

  toggleDescriptionSection() {
    const container = document.getElementById('description-container')
    const isVisible = container.style.display !== 'none'
    container.style.display = isVisible ? 'none' : 'block'
    
    if (!isVisible) {
      const textarea = document.getElementById('task-description-input')
      if (textarea) {
        textarea.focus()
      }
    }
  }

  toggleSubtasksSection() {
    const container = document.getElementById('subtasks-creation-container')
    const isVisible = container.style.display !== 'none'
    container.style.display = isVisible ? 'none' : 'block'
    
    if (!isVisible) {
      document.getElementById('new-subtask-input').focus()
    }
  }

  addPendingSubtask() {
    const input = document.getElementById('new-subtask-input')
    const title = input.value.trim()

    if (!title) return

    this.pendingSubtasks.push(title)
    this.renderPendingSubtasks()
    input.value = ''
    input.focus()
  }

  renderPendingSubtasks() {
    const container = document.getElementById('subtasks-creation-list')
    container.innerHTML = ''

    this.pendingSubtasks.forEach((subtask, index) => {
      const item = document.createElement('div')
      item.className = 'subtask-pending-item'
      item.innerHTML = `
        <span class="subtask-pending-text">${this.escapeHtml(subtask)}</span>
        <button type="button" class="subtask-pending-delete" data-index="${index}" title="Supprimer">×</button>
      `
      
      item.querySelector('.subtask-pending-delete').addEventListener('click', () => {
        this.removePendingSubtask(index)
      })

      container.appendChild(item)
    })

    // Afficher la section si des sous-tâches existent
    if (this.pendingSubtasks.length > 0) {
      document.getElementById('subtasks-creation-container').style.display = 'block'
    }
  }

  removePendingSubtask(index) {
    this.pendingSubtasks.splice(index, 1)
    this.renderPendingSubtasks()
    
    if (this.pendingSubtasks.length === 0) {
      document.getElementById('subtasks-creation-container').style.display = 'none'
    }
  }

  clearPendingSubtasks() {
    this.pendingSubtasks = []
    document.getElementById('subtasks-creation-list').innerHTML = ''
    document.getElementById('new-subtask-input').value = ''
    document.getElementById('subtasks-creation-container').style.display = 'none'
  }

  deleteTask(id) {
    if (confirm('Voulez-vous vraiment supprimer cette tâche ?')) {
      const taskCard = document.querySelector(`[data-id="${id}"]`)
      if (taskCard) {
        taskCard.classList.add('deleting')
        setTimeout(() => {
          this.tasks = this.tasks.filter(task => task.id !== id)
          this.saveTasks()
          this.render()
        }, 300)
      } else {
        this.tasks = this.tasks.filter(task => task.id !== id)
        this.saveTasks()
        this.render()
      }
    }
  }

  toggleTask(id) {
    const task = this.tasks.find(t => t.id === id)
    if (task) {
      task.completed = !task.completed

      if (task.completed && task.recurring && task.recurrence) {
        this.createRecurringTask(task)
      }

      this.saveTasks()
      this.render()
    }
  }

  createRecurringTask(originalTask) {
    const newTask = { ...originalTask }
    newTask.id = Date.now()
    newTask.completed = false
    newTask.createdAt = new Date().toISOString()
    newTask.notificationsSent = {
      '1week': false,
      '3days': false,
      '24h': false,
      '1h': false,
      'start': false
    }

    if (originalTask.dueDate) {
      const dueDate = new Date(originalTask.dueDate)

      switch (originalTask.recurrence) {
        case 'daily':
          dueDate.setDate(dueDate.getDate() + 1)
          break
        case 'weekly':
          dueDate.setDate(dueDate.getDate() + 7)
          break
        case 'monthly':
          dueDate.setMonth(dueDate.getMonth() + 1)
          break
      }

      newTask.dueDate = dueDate.toISOString().split('T')[0]
    }

    this.tasks.unshift(newTask)
    this.scheduleNotifications(newTask)
  }

  togglePin(id) {
    const task = this.tasks.find(t => t.id === id)
    if (task) {
      task.pinned = !task.pinned
      this.saveTasks()
      this.render()
    }
  }

  duplicateTask(id) {
    const originalTask = this.tasks.find(t => t.id === id)
    if (!originalTask) return

    // Demander les options de duplication
    const duplicateWithSubtasks = originalTask.subtasks.length > 0
      ? confirm('Dupliquer avec les sous-tâches ?\n\nOK = avec sous-tâches\nAnnuler = sans sous-tâches')
      : false

    const resetDates = confirm('Réinitialiser les dates ?\n\nOK = sans dates\nAnnuler = garder les dates')

    // Créer la copie
    const duplicatedTask = {
      id: Date.now(),
      title: `${originalTask.title} (copie)`,
      description: originalTask.description || null,
      completed: false, // Toujours réinitialiser le statut
      priority: originalTask.priority,
      category: originalTask.category,
      startDate: resetDates ? null : originalTask.startDate,
      dueDate: resetDates ? null : originalTask.dueDate,
      createdAt: new Date().toISOString(),
      subtasks: duplicateWithSubtasks 
        ? originalTask.subtasks.map(st => ({
            id: Date.now() + Math.random(),
            title: st.title,
            completed: false // Réinitialiser le statut des sous-tâches
          }))
        : [],
      pinned: false, // Ne pas dupliquer l'état "épinglé"
      recurring: originalTask.recurring,
      recurrence: originalTask.recurrence,
      notificationsSent: {
        '1week': false,
        '3days': false,
        '24h': false,
        '1h': false,
        'start': false
      },
      reminders: {
        '1week': false,
        '3days': false,
        '24h': true,
        '1h': true,
        'start': false
      }
    }

    // Ajouter la tâche dupliquée au début de la liste
    this.tasks.unshift(duplicatedTask)
    this.saveTasks()
    this.render()
    this.scheduleNotifications(duplicatedTask)
  }

  editTask(id) {
    const task = this.tasks.find(t => t.id === id)
    if (!task) return

    this.currentEditId = id
    document.getElementById('edit-title').value = task.title
    document.getElementById('edit-description').value = task.description || ''
    document.getElementById('edit-priority').value = task.priority
    document.getElementById('edit-category').value = task.category
    document.getElementById('edit-start-date').value = task.startDate || ''
    document.getElementById('edit-due-date').value = task.dueDate || ''
    document.getElementById('edit-pinned').checked = task.pinned
    document.getElementById('edit-recurring').checked = task.recurring
    document.getElementById('edit-recurrence').value = task.recurrence || 'daily'
    document.getElementById('edit-recurrence').style.display = task.recurring ? 'block' : 'none'

    // Remplir les rappels personnalisés
    const reminders = task.reminders || {
      '1week': false,
      '3days': false,
      '24h': true,
      '1h': true,
      'start': false
    }
    document.getElementById('edit-reminder-1week').checked = reminders['1week'] || false
    document.getElementById('edit-reminder-3days').checked = reminders['3days'] || false
    document.getElementById('edit-reminder-24h').checked = reminders['24h'] !== false
    document.getElementById('edit-reminder-1h').checked = reminders['1h'] !== false
    document.getElementById('edit-reminder-start').checked = reminders['start'] || false

    document.getElementById('edit-modal').classList.add('active')
  }

  saveEdit() {
    if (!this.currentEditId) return

    const task = this.tasks.find(t => t.id === this.currentEditId)
    if (task) {
      const oldDueDate = task.dueDate
      const oldStartDate = task.startDate
      task.title = document.getElementById('edit-title').value.trim()
      const descriptionValue = document.getElementById('edit-description').value.trim()
      task.description = descriptionValue || null
      task.priority = document.getElementById('edit-priority').value
      task.category = document.getElementById('edit-category').value.trim() || 'Général'
      task.startDate = document.getElementById('edit-start-date').value || null
      task.dueDate = document.getElementById('edit-due-date').value || null
      task.pinned = document.getElementById('edit-pinned').checked
      task.recurring = document.getElementById('edit-recurring').checked
      task.recurrence = task.recurring ? document.getElementById('edit-recurrence').value : null

      // Sauvegarder les rappels personnalisés
      if (!task.reminders) {
        task.reminders = {}
      }
      task.reminders['1week'] = document.getElementById('edit-reminder-1week').checked
      task.reminders['3days'] = document.getElementById('edit-reminder-3days').checked
      task.reminders['24h'] = document.getElementById('edit-reminder-24h').checked
      task.reminders['1h'] = document.getElementById('edit-reminder-1h').checked
      task.reminders['start'] = document.getElementById('edit-reminder-start').checked

      // Réinitialiser les notifications si les dates ont changé
      if (oldDueDate !== task.dueDate || oldStartDate !== task.startDate) {
        task.notificationsSent = {
          '1week': false,
          '3days': false,
          '24h': false,
          '1h': false,
          'start': false
        }
        this.scheduleNotifications(task)
      } else {
        // Réinitialiser les notifications non envoyées selon les nouveaux rappels
        Object.keys(task.notificationsSent).forEach(key => {
          if (!task.reminders[key]) {
            task.notificationsSent[key] = false
          }
        })
        this.scheduleNotifications(task)
      }

      this.saveTasks()
      this.render()
      this.closeModals()
    }
  }

  addSubtask(taskId, subtaskTitle) {
    const task = this.tasks.find(t => t.id === taskId)
    if (task && subtaskTitle) {
      task.subtasks.push({
        id: Date.now(),
        title: subtaskTitle,
        completed: false
      })
      this.saveTasks()
      this.render()
    }
  }

  toggleSubtask(taskId, subtaskId) {
    const task = this.tasks.find(t => t.id === taskId)
    if (task) {
      const subtask = task.subtasks.find(st => st.id === subtaskId)
      if (subtask) {
        subtask.completed = !subtask.completed
        this.saveTasks()
        this.render()
      }
    }
  }

  deleteSubtask(taskId, subtaskId) {
    const task = this.tasks.find(t => t.id === taskId)
    if (task) {
      task.subtasks = task.subtasks.filter(st => st.id !== subtaskId)
      this.saveTasks()
      this.render()
    }
  }

  getFilteredTasks() {
    let filtered = [...this.tasks]

    const statusFilter = document.getElementById('filter-status').value
    if (statusFilter === 'completed') {
      filtered = filtered.filter(t => t.completed)
    } else if (statusFilter === 'active') {
      filtered = filtered.filter(t => !t.completed)
    }

    const categoryFilter = document.getElementById('filter-category').value
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(t => t.category === categoryFilter)
    }

    const searchQuery = document.getElementById('search-input').value.toLowerCase()
    if (searchQuery) {
      filtered = filtered.filter(t => {
        const titleMatch = t.title.toLowerCase().includes(searchQuery)
        const descriptionMatch = t.description && t.description.toLowerCase().includes(searchQuery)
        const categoryMatch = t.category.toLowerCase().includes(searchQuery)
        return titleMatch || descriptionMatch || categoryMatch
      })
    }

    return filtered
  }

  getSortedTasks(tasks) {
    const sortBy = document.getElementById('sort-by').value

    return tasks.sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1
      }

      switch (sortBy) {
        case 'start':
          if (!a.startDate) return 1
          if (!b.startDate) return -1
          return new Date(a.startDate) - new Date(b.startDate)

        case 'due':
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return new Date(a.dueDate) - new Date(b.dueDate)

        case 'priority':
          const priorityOrder = { high: 0, medium: 1, low: 2 }
          return priorityOrder[a.priority] - priorityOrder[b.priority]

        default:
          return new Date(b.createdAt) - new Date(a.createdAt)
      }
    })
  }

  handleSearch(query) {
    this.render()
  }

  getDueDateStatus(dueDate) {
    if (!dueDate) return null

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)

    const diffTime = due - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) return 'overdue'
    if (diffDays <= 2) return 'soon'
    return 'normal'
  }

  formatDate(dateString) {
    if (!dateString) return ''
    const date = new Date(dateString)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const target = new Date(dateString)
    target.setHours(0, 0, 0, 0)

    const diffTime = target - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Aujourd'hui"
    if (diffDays === 1) return 'Demain'
    if (diffDays === -1) return 'Hier'
    if (diffDays < 0) return `Il y a ${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''}`

    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  formatDueDate(dueDate) {
    if (!dueDate) return ''

    const date = new Date(dueDate)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(dueDate)
    due.setHours(0, 0, 0, 0)

    const diffTime = due - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Aujourd'hui"
    if (diffDays === 1) return 'Demain'
    if (diffDays === -1) return 'Hier'
    if (diffDays < 0) return `En retard de ${Math.abs(diffDays)} jour${Math.abs(diffDays) > 1 ? 's' : ''}`

    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  scheduleNotifications(task) {
    if (task.completed) return

    // Initialiser reminders et notificationsSent si nécessaire
    if (!task.reminders) {
      task.reminders = {
        '1week': false,
        '3days': false,
        '24h': true,
        '1h': true,
        'start': false
      }
    }
    if (!task.notificationsSent) {
      task.notificationsSent = {
        '1week': false,
        '3days': false,
        '24h': false,
        '1h': false,
        'start': false
      }
    }

    const now = new Date()

    // Programmer les rappels pour la date de fin
    if (task.dueDate) {
      const dueDate = new Date(task.dueDate)

      // 1 semaine avant
      if (task.reminders['1week']) {
        const notification1week = new Date(dueDate)
        notification1week.setDate(notification1week.getDate() - 7)
        if (notification1week > now && !task.notificationsSent['1week']) {
          const delay = notification1week.getTime() - now.getTime()
          if (delay > 0) {
            setTimeout(() => this.sendNotification(task, '1week', 'échéance'), delay)
          }
        }
      }

      // 3 jours avant
      if (task.reminders['3days']) {
        const notification3days = new Date(dueDate)
        notification3days.setDate(notification3days.getDate() - 3)
        if (notification3days > now && !task.notificationsSent['3days']) {
          const delay = notification3days.getTime() - now.getTime()
          if (delay > 0) {
            setTimeout(() => this.sendNotification(task, '3days', 'échéance'), delay)
          }
        }
      }

      // 24h avant
      if (task.reminders['24h']) {
        const notification24h = new Date(dueDate)
        notification24h.setHours(notification24h.getHours() - 24)
        if (notification24h > now && !task.notificationsSent['24h']) {
          const delay = notification24h.getTime() - now.getTime()
          if (delay > 0) {
            setTimeout(() => this.sendNotification(task, '24h', 'échéance'), delay)
          }
        }
      }

      // 1h avant
      if (task.reminders['1h']) {
        const notification1h = new Date(dueDate)
        notification1h.setHours(notification1h.getHours() - 1)
        if (notification1h > now && !task.notificationsSent['1h']) {
          const delay = notification1h.getTime() - now.getTime()
          if (delay > 0) {
            setTimeout(() => this.sendNotification(task, '1h', 'échéance'), delay)
          }
        }
      }
    }

    // Programmer le rappel pour la date de début
    if (task.startDate && task.reminders['start']) {
      const startDate = new Date(task.startDate)
      startDate.setHours(startDate.getHours() - 1) // 1h avant le début
      if (startDate > now && !task.notificationsSent['start']) {
        const delay = startDate.getTime() - now.getTime()
        if (delay > 0) {
          setTimeout(() => this.sendNotification(task, 'start', 'début'), delay)
        }
      }
    }
  }

  checkNotifications() {
    const now = new Date()

    this.tasks.forEach(task => {
      if (task.completed) return

      const reminders = task.reminders || {
        '1week': false,
        '3days': false,
        '24h': true,
        '1h': true,
        'start': false
      }

      // Vérifier les rappels pour la date de fin
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate)
        
        // 1 semaine avant
        if (reminders['1week']) {
          const notification1week = new Date(dueDate)
          notification1week.setDate(notification1week.getDate() - 7)
          const diff = Math.abs(notification1week - now) / (1000 * 60)
          if (diff <= 5 && !task.notificationsSent['1week']) {
            this.sendNotification(task, '1week', 'échéance')
          }
        }

        // 3 jours avant
        if (reminders['3days']) {
          const notification3days = new Date(dueDate)
          notification3days.setDate(notification3days.getDate() - 3)
          const diff = Math.abs(notification3days - now) / (1000 * 60)
          if (diff <= 5 && !task.notificationsSent['3days']) {
            this.sendNotification(task, '3days', 'échéance')
          }
        }

        // 24h avant
        if (reminders['24h']) {
          const notification24h = new Date(dueDate)
          notification24h.setHours(notification24h.getHours() - 24)
          const diff = Math.abs(notification24h - now) / (1000 * 60)
          if (diff <= 5 && !task.notificationsSent['24h']) {
            this.sendNotification(task, '24h', 'échéance')
          }
        }

        // 1h avant
        if (reminders['1h']) {
          const notification1h = new Date(dueDate)
          notification1h.setHours(notification1h.getHours() - 1)
          const diff = Math.abs(notification1h - now) / (1000 * 60)
          if (diff <= 5 && !task.notificationsSent['1h']) {
            this.sendNotification(task, '1h', 'échéance')
          }
        }
      }

      // Vérifier le rappel pour la date de début
      if (task.startDate && reminders['start']) {
        const startDate = new Date(task.startDate)
        startDate.setHours(startDate.getHours() - 1)
        const diff = Math.abs(startDate - now) / (1000 * 60)
        if (diff <= 5 && !task.notificationsSent['start']) {
          this.sendNotification(task, 'start', 'début')
        }
      }
    })
  }

  sendNotification(task, type, dateType = 'échéance') {
    if (task.notificationsSent[type]) return

    let message = ''
    switch (type) {
      case '1week':
        message = `Rappel : la tâche "${task.title}" arrive à ${dateType} dans 1 semaine !`
        break
      case '3days':
        message = `Rappel : la tâche "${task.title}" arrive à ${dateType} dans 3 jours !`
        break
      case '24h':
        message = `Rappel : la tâche "${task.title}" arrive à ${dateType} dans 24 heures !`
        break
      case '1h':
        message = `Rappel : la tâche "${task.title}" arrive à ${dateType} dans 1 heure !`
        break
      case 'start':
        message = `Rappel : la tâche "${task.title}" commence dans 1 heure !`
        break
    }

    // Jouer un son si activé
    this.playNotificationSound()

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Rappel To-Do List', { 
        body: message,
        icon: '/vite.svg'
      })
      task.notificationsSent[type] = true
      this.saveTasks()
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification('Rappel To-Do List', { 
            body: message,
            icon: '/vite.svg'
          })
          task.notificationsSent[type] = true
          this.saveTasks()
        }
      })
    } else {
      console.warn('Notifications refusées par l\'utilisateur')
    }
  }

  playNotificationSound() {
    const soundEnabled = localStorage.getItem('notificationSound') !== 'false'
    if (!soundEnabled) return

    // Créer un son simple avec l'API Web Audio
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + 0.5)
    } catch (e) {
      // Fallback : utiliser un beep système si Web Audio n'est pas disponible
      console.log('🔔 Notification')
    }
  }

  updateProgress() {
    const total = this.tasks.length
    const completed = this.tasks.filter(t => t.completed).length
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0

    document.getElementById('task-counter').textContent = `${total} tâche${total > 1 ? 's' : ''}`
    document.getElementById('progress-percent').textContent = `${percentage}%`
    document.getElementById('progress-fill').style.width = `${percentage}%`
  }

  updateCategoryFilter() {
    const categories = [...new Set(this.tasks.map(t => t.category))]
    const select = document.getElementById('filter-category')

    const currentValue = select.value
    select.innerHTML = '<option value="all">Toutes catégories</option>'

    categories.forEach(cat => {
      const option = document.createElement('option')
      option.value = cat
      option.textContent = cat
      select.appendChild(option)
    })

    select.value = currentValue
  }

  renderTask(task) {
    const card = document.createElement('div')
    card.className = `task-card priority-${task.priority} ${task.completed ? 'completed' : ''} ${task.pinned ? 'pinned' : ''}`
    card.setAttribute('draggable', 'true')
    card.dataset.id = task.id

    card.addEventListener('dragstart', (e) => this.handleDragStart(e, task.id))
    card.addEventListener('dragover', (e) => this.handleDragOver(e))
    card.addEventListener('drop', (e) => this.handleDrop(e, task.id))
    card.addEventListener('dragend', () => this.handleDragEnd())

    const dueStatus = this.getDueDateStatus(task.dueDate)
    const dueDateFormatted = this.formatDueDate(task.dueDate)
    const startDateFormatted = this.formatDate(task.startDate)

    card.innerHTML = `
      <div class="task-header">
        <div class="task-main">
          <input
            type="checkbox"
            class="task-checkbox"
            ${task.completed ? 'checked' : ''}
            data-id="${task.id}"
          />
          <div class="task-content">
            <div class="task-title">
              ${task.completed ? '<span style="text-decoration: line-through;">' : ''}
              ${this.escapeHtml(task.title)}
              ${task.completed ? '</span> ✅' : ''}
            </div>
            <div class="task-meta">
              <span class="task-badge badge-category">${this.escapeHtml(task.category)}</span>
              ${task.startDate ? `<span class="task-badge" style="background: var(--primary-color); color: white;">📅 Début: ${startDateFormatted}</span>` : ''}
              ${task.dueDate ? `<span class="task-badge badge-due ${dueStatus}">📅 Fin: ${dueDateFormatted}</span>` : ''}
              ${task.recurring ? '<span class="task-badge badge-recurring">🔁 Récurrente</span>' : ''}
              ${task.pinned ? '<span class="task-badge" style="background: var(--warning-color); color: #000;">📌 Épinglée</span>' : ''}
            </div>
            ${task.description ? `
              <div class="task-description-preview">
                <span class="description-icon">📝</span>
                <span class="description-text">${this.escapeHtml(task.description.length > 100 ? task.description.substring(0, 100) + '...' : task.description)}</span>
              </div>
            ` : ''}
          </div>
        </div>
        <div class="task-actions">
          <button class="task-btn" data-action="pin" data-id="${task.id}" title="${task.pinned ? 'Désépingler' : 'Épingler'}">
            ${task.pinned ? '📌' : '📍'}
          </button>
          <button class="task-btn" data-action="duplicate" data-id="${task.id}" title="Dupliquer la tâche">📋</button>
          <button class="task-btn" data-action="edit" data-id="${task.id}" title="Éditer">✏️</button>
          <button class="task-btn delete" data-action="delete" data-id="${task.id}" title="Supprimer">🗑️</button>
        </div>
      </div>
      <div class="subtasks-section">
        ${task.subtasks.length > 0 ? `
          <div class="subtasks-progress">
            <div class="subtasks-progress-info">
              <span>Sous-tâches : ${task.subtasks.filter(st => st.completed).length}/${task.subtasks.length}</span>
              <span class="subtasks-progress-percent">${Math.round((task.subtasks.filter(st => st.completed).length / task.subtasks.length) * 100)}%</span>
            </div>
            <div class="subtasks-progress-bar">
              <div class="subtasks-progress-fill" style="width: ${(task.subtasks.filter(st => st.completed).length / task.subtasks.length) * 100}%"></div>
            </div>
          </div>
        ` : ''}
        <div class="subtask-input-group">
          <input
            type="text"
            class="subtask-input"
            placeholder="Ajouter une sous-tâche..."
            data-task-id="${task.id}"
          />
          <button class="subtask-add-btn" data-task-id="${task.id}">+</button>
        </div>
        ${task.subtasks.length > 0 ? `
          <div class="subtasks-list">
            ${task.subtasks.map(st => `
              <div class="subtask-item ${st.completed ? 'completed' : ''}">
                <input
                  type="checkbox"
                  class="subtask-checkbox"
                  ${st.completed ? 'checked' : ''}
                  data-task-id="${task.id}"
                  data-subtask-id="${st.id}"
                />
                <span class="subtask-text">${this.escapeHtml(st.title)}</span>
                <button
                  class="subtask-delete"
                  data-task-id="${task.id}"
                  data-subtask-id="${st.id}"
                >×</button>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `

    card.querySelector('.task-checkbox').addEventListener('change', () => this.toggleTask(task.id))

    card.querySelectorAll('.task-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const action = btn.dataset.action
        const id = parseInt(btn.dataset.id)

        if (action === 'delete') this.deleteTask(id)
        else if (action === 'edit') this.editTask(id)
        else if (action === 'pin') this.togglePin(id)
        else if (action === 'duplicate') this.duplicateTask(id)
      })
    })

    const subtaskInput = card.querySelector('.subtask-input')
    const subtaskBtn = card.querySelector('.subtask-add-btn')

    subtaskBtn.addEventListener('click', () => {
      const title = subtaskInput.value.trim()
      if (title) {
        this.addSubtask(task.id, title)
        subtaskInput.value = ''
      }
    })

    subtaskInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const title = subtaskInput.value.trim()
        if (title) {
          this.addSubtask(task.id, title)
          subtaskInput.value = ''
        }
      }
    })

    card.querySelectorAll('.subtask-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const taskId = parseInt(e.target.dataset.taskId)
        const subtaskId = parseInt(e.target.dataset.subtaskId)
        this.toggleSubtask(taskId, subtaskId)
      })
    })

    card.querySelectorAll('.subtask-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const taskId = parseInt(e.target.dataset.taskId)
        const subtaskId = parseInt(e.target.dataset.subtaskId)
        this.deleteSubtask(taskId, subtaskId)
      })
    })

    return card
  }

  handleDragStart(e, taskId) {
    this.draggedElement = taskId
    e.target.classList.add('dragging')
  }

  handleDragOver(e) {
    e.preventDefault()
  }

  handleDrop(e, targetId) {
    e.preventDefault()

    if (this.draggedElement === targetId) return

    const draggedIndex = this.tasks.findIndex(t => t.id === this.draggedElement)
    const targetIndex = this.tasks.findIndex(t => t.id === targetId)

    const [draggedTask] = this.tasks.splice(draggedIndex, 1)
    this.tasks.splice(targetIndex, 0, draggedTask)

    this.saveTasks()
    this.render()
  }

  handleDragEnd() {
    document.querySelectorAll('.task-card').forEach(card => {
      card.classList.remove('dragging')
    })
  }

  render() {
    const container = document.getElementById('tasks-container')
    if (!container) return

    const filtered = this.getFilteredTasks()
    const sorted = this.getSortedTasks(filtered)

    container.innerHTML = ''

    if (sorted.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <div class="empty-state-text">Aucune tâche à afficher</div>
        </div>
      `
    } else {
      sorted.forEach((task, index) => {
        const card = this.renderTask(task)
        container.appendChild(card)
        // Animation d'apparition avec délai
        setTimeout(() => {
          card.classList.add('task-added')
        }, index * 50)
        this.scheduleNotifications(task)
      })
    }

    this.updateProgress()
    this.updateCategoryFilter()
  }

  showStats() {
    const total = this.tasks.length
    const completed = this.tasks.filter(t => t.completed).length
    const active = total - completed
    const highPriority = this.tasks.filter(t => !t.completed && t.priority === 'high').length
    const overdue = this.tasks.filter(t => {
      if (t.completed || !t.dueDate) return false
      return this.getDueDateStatus(t.dueDate) === 'overdue'
    }).length

    const categories = {}
    this.tasks.forEach(t => {
      categories[t.category] = (categories[t.category] || 0) + 1
    })

    const modal = document.getElementById('stats-modal')
    const content = document.getElementById('stats-content')

    content.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${total}</div>
          <div class="stat-label">Total de tâches</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${completed}</div>
          <div class="stat-label">Terminées</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${active}</div>
          <div class="stat-label">En cours</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${highPriority}</div>
          <div class="stat-label">Priorité haute</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${overdue}</div>
          <div class="stat-label">En retard</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${total > 0 ? Math.round((completed / total) * 100) : 0}%</div>
          <div class="stat-label">Taux d'accomplissement</div>
        </div>
      </div>

      <div class="chart-container">
        <h3>Tâches par catégorie</h3>
        ${Object.entries(categories).map(([cat, count]) => `
          <div class="chart-bar">
            <div class="chart-label">
              <span>${this.escapeHtml(cat)}</span>
              <span>${count}</span>
            </div>
            <div style="background: var(--bg-secondary); border-radius: 4px;">
              <div class="chart-bar-fill" style="width: ${(count / total) * 100}%"></div>
            </div>
          </div>
        `).join('')}
      </div>
    `

    modal.classList.add('active')
  }

  closeModals() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('active')
    })
  }

  showBackups() {
    const username = this.authManager.getActiveUser()
    if (!username) return

    const backupKeys = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(`backup_${username}_`)) {
        backupKeys.push(key)
      }
    }

    backupKeys.sort().reverse() // Plus récent en premier

    const modal = document.getElementById('backup-modal')
    const content = document.getElementById('backups-list')

    if (backupKeys.length === 0) {
      content.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Aucun backup disponible</p>'
    } else {
      content.innerHTML = `
        <div class="backups-list">
          ${backupKeys.map(key => {
            const backupData = JSON.parse(localStorage.getItem(key))
            const date = new Date(backupData.date)
            const dateStr = date.toLocaleDateString('fr-FR', { 
              day: 'numeric', 
              month: 'short', 
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })
            const taskCount = backupData.tasks ? backupData.tasks.length : 0
            const backupDate = key.split('_')[2] // Extraire la date du backup
            
            return `
              <div class="backup-item">
                <div class="backup-info">
                  <div class="backup-date">${dateStr}</div>
                  <div class="backup-details">${taskCount} tâche${taskCount > 1 ? 's' : ''}</div>
                </div>
                <button class="btn-secondary backup-restore-btn" data-date="${backupDate}">
                  Restaurer
                </button>
              </div>
            `
          }).join('')}
        </div>
      `

      // Ajouter les event listeners pour restaurer
      content.querySelectorAll('.backup-restore-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const backupDate = btn.dataset.date
          this.restoreFromBackup(username, backupDate)
          this.closeModals()
        })
      })
    }

    modal.classList.add('active')
  }

  exportJSON() {
    const dataStr = JSON.stringify(this.tasks, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `todo-list-${new Date().toISOString().split('T')[0]}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  exportCSV() {
    const headers = ['Titre', 'Description', 'Statut', 'Priorité', 'Catégorie', 'Date de début', 'Date de fin', 'Créée le']
    const rows = this.tasks.map(t => [
      t.title,
      t.description || '',
      t.completed ? 'Terminée' : 'En cours',
      t.priority,
      t.category,
      t.startDate || '',
      t.dueDate || '',
      new Date(t.createdAt).toLocaleDateString('fr-FR')
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    const dataBlob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `todo-list-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  importFile(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const content = event.target.result
        let importedTasks = []

        if (file.name.endsWith('.json')) {
          importedTasks = JSON.parse(content)
        } else if (file.name.endsWith('.csv')) {
          const lines = content.split('\n').slice(1)
          importedTasks = lines.map(line => {
            const [title, description, status, priority, category, startDate, dueDate, createdAt] = line.split(',').map(cell => cell.replace(/"/g, '').trim())
            return {
              id: Date.now() + Math.random(),
              title,
              description: description || null,
              completed: status === 'Terminée',
              priority: priority || 'medium',
              category: category || 'Général',
              startDate: startDate || null,
              dueDate: dueDate || null,
              createdAt: new Date().toISOString(),
              subtasks: [],
              pinned: false,
              recurring: false,
              recurrence: null,
              notificationsSent: { '24h': false, '1h': false }
            }
          }).filter(t => t.title)
        }

        if (importedTasks.length > 0) {
          if (confirm(`Importer ${importedTasks.length} tâche(s) ? Les tâches existantes seront conservées.`)) {
            this.tasks = [...importedTasks, ...this.tasks]
            this.saveTasks()
            this.render()
            importedTasks.forEach(task => this.scheduleNotifications(task))
          }
        }
      } catch (error) {
        alert('Erreur lors de l\'import du fichier. Vérifiez le format.')
      }
    }

    reader.readAsText(file)
    e.target.value = ''
  }

  escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

// Initialisation de l'application
const authManager = new AuthManager()

// Initialiser l'app seulement si l'utilisateur est connecté
if (authManager.getActiveUser()) {
  window.todoApp = new TodoApp(authManager)
}
