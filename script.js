// script.js - Versão COMPLETA com Autenticação, Painel TV e Gerenciamento de Usuários

// ESTRUTURA FIREBASE (Use suas credenciais)
// ---------------------------------------------
const firebaseConfig = {
    apiKey: "AIzaSyA-V0sQPZbJfXMFlUjjtniSHSy37C7k4zs",
    authDomain: "inspetorpro-6d9a7.firebaseapp.com",
    databaseURL: "https://inspetorpro-6d9a7-default-rtdb.firebaseio.com",
    projectId: "inspetorpro-6d9a7",
    storageBucket: "inspetorpro-6d9a7.firebasestorage.app",
    messagingSenderId: "568938045626",
    appId: "1:568938045626:web:c3042e646d74ad0ec8a283",
    measurementId: "G-LT8ZSZSWL0"
};

// Inicializa o Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth(); 
// ---------------------------------------------


// Estrutura de dados global local
let filaDeEspera = [];
let emInspecao = [];
let historicoFinalizado = []; // Para o Painel TV
let listaUsuarios = []; // NOVO: Para a lista de usuários
let realtimeSyncListener = null; 


// ---------------------------------------------
// Funções de Controle de Tela e UI
// ---------------------------------------------

function setActivePage(pageId) {
    document.querySelectorAll('.content-container').forEach(container => {
        container.classList.add('hidden');
    });

    document.querySelectorAll('.nav-item').forEach(navItem => {
        navItem.classList.remove('active');
    });

    if (pageId.includes('login') || pageId.includes('cadastro') || pageId.includes('recuperar')) {
        document.getElementById(pageId).classList.remove('hidden');
        return;
    }

    document.getElementById(pageId).classList.remove('hidden');
    
    const pageKey = pageId.replace('page-', '');
    const navItem = document.querySelector(`[data-page="${pageKey}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }
    
    if (pageId === 'page-tecnico') {
        renderTechDashboard();
    } else if (pageId === 'page-paineltv') {
        renderPainelTV();
    } else if (pageId === 'page-usuarios') { 
        // Chama a função de renderização de usuários que usará a lista atualizada pelo setupRealtimeSync
        renderUsers();
    }
}

function toggleMainNav(show) {
    const nav = document.getElementById('main-nav');
    if (nav) {
        if (show) {
            nav.classList.remove('hidden');
        } else {
            nav.classList.add('hidden');
        }
    }
}

function displayAuthMessage(pageId, message, isSuccess = false) {
    const messageElement = document.getElementById(`${pageId.split('-')[1]}-message`);
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.className = 'auth-message';
        if (message) {
             if (isSuccess) {
                 messageElement.classList.add('success');
                 messageElement.classList.remove('error');
             } else {
                 messageElement.classList.add('error');
                 messageElement.classList.remove('success');
             }
        }
    }
}

// ---------------------------------------------
// Funções de Autenticação (Auth)
// ---------------------------------------------

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    displayAuthMessage('page-login', 'Entrando...');

    auth.setPersistence(firebase.auth.Auth.Persistence.NONE) 
        .then(() => {
            return auth.signInWithEmailAndPassword(email, password);
        })
        .then(() => {
            displayAuthMessage('page-login', '');
        })
        .catch(error => {
            let message = "Erro ao fazer login. Credenciais inválidas.";
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                message = "E-mail ou senha incorretos.";
            } else if (error.code === 'auth/invalid-email') {
                 message = "O formato do e-mail é inválido.";
            }
            displayAuthMessage('page-login', message);
        });
}

function handleCadastro(e) {
    e.preventDefault();
    const email = document.getElementById('cadastro-email').value;
    const password = document.getElementById('cadastro-password').value;
    displayAuthMessage('page-cadastro', 'Cadastrando...');
    
    if (password.length < 6) {
        displayAuthMessage('page-cadastro', "A senha deve ter pelo menos 6 caracteres.");
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            
            // LÓGICA DE ROLE: O primeiro usuário registrado será 'admin'.
            // Verifica se já existe algum registro no nó 'usuarios'
            return database.ref('usuarios').once('value')
                .then(snapshot => {
                    const existingUsers = snapshot.val();
                    const isFirstUser = !existingUsers || Object.keys(existingUsers).length === 0;
                    const userRole = isFirstUser ? 'admin' : 'recepcao';
                    
                    return database.ref('usuarios').child(user.uid).set({
                        email: user.email,
                        dataCadastro: new Date().toLocaleString('pt-BR'),
                        role: userRole 
                    });
                });
        })
        .then(() => {
            displayAuthMessage('page-cadastro', "Cadastro realizado com sucesso! Faça login.", true);
            document.getElementById('cadastro-form').reset();
            setTimeout(() => {
                setActivePage('page-login');
            }, 3000);
        })
        .catch(error => {
            let message = "Erro ao cadastrar. Tente novamente.";
            if (error.code === 'auth/email-already-in-use') {
                message = "Este e-mail já está em uso.";
            } else if (error.code === 'auth/invalid-email') {
                message = "O formato do e-mail é inválido.";
            }
            console.error("Erro no cadastro ou DB:", error); 
            displayAuthMessage('page-cadastro', message);
        });
}

function handleRecuperar(e) {
    e.preventDefault();
    const email = document.getElementById('recuperar-email').value;
    displayAuthMessage('page-recuperar', 'Enviando e-mail...');

    auth.sendPasswordResetEmail(email)
        .then(() => {
            displayAuthMessage('page-recuperar', `Link de redefinição enviado para ${email}. Verifique sua caixa de entrada.`, true);
            document.getElementById('recuperar-form').reset();
        })
        .catch(error => {
             let message = "Erro ao enviar e-mail. Verifique se o endereço está correto.";
            if (error.code === 'auth/user-not-found') {
                message = "Nenhuma conta encontrada com este e-mail.";
            } else if (error.code === 'auth/invalid-email') {
                message = "O formato do e-mail é inválido.";
            }
            displayAuthMessage('page-recuperar', message);
        });
}

function handleLogout() {
    auth.signOut()
        .catch(error => {
            console.error("Erro ao fazer logout:", error);
            alert("Erro ao fazer logout.");
        });
}

// ---------------------------------------------
// Sincronização em Tempo Real (on('value'))
// ---------------------------------------------

function setupRealtimeSync() {
    if (realtimeSyncListener) {
        database.ref('/').off('value', realtimeSyncListener);
    }
    
    const listenerCallback = (snapshot) => { 
        const data = snapshot.val();
        
        filaDeEspera = [];
        emInspecao = [];
        historicoFinalizado = [];
        listaUsuarios = []; // Limpa a lista de usuários
        
        if (data) {
            
            if (data.filaDeEspera) {
                Object.keys(data.filaDeEspera).forEach(key => {
                    const veiculo = data.filaDeEspera[key];
                    veiculo.id = key; 
                    filaDeEspera.push(veiculo); 
                });
            }
            
            if (data.emInspecao) {
                Object.keys(data.emInspecao).forEach(key => {
                    const veiculo = data.emInspecao[key];
                    veiculo.id = key; 
                    emInspecao.push(veiculo);
                });
            }

            if (data.historico) {
                Object.keys(data.historico).forEach(key => {
                    const veiculo = data.historico[key];
                    veiculo.id = key; 
                    historicoFinalizado.push(veiculo);
                });
            }
            
            // LÓGICA DE CAPTURA DE USUÁRIOS
            if (data.usuarios) { 
                Object.keys(data.usuarios).forEach(uid => {
                    const user = data.usuarios[uid];
                    user.uid = uid; 
                    listaUsuarios.push(user);
                });
            }
        }
        
        // ORDENAÇÕES
        filaDeEspera.sort((a, b) => b.id.localeCompare(a.id)); 
        emInspecao.sort((a, b) => b.id.localeCompare(a.id));
        
        historicoFinalizado.sort((a, b) => {
            const parseDate = (dateStr) => {
                if (!dateStr) return 0;
                const [datePart, timePart] = dateStr.split(', ');
                const [day, month, year] = datePart.split('/');
                return new Date(`${year}/${month}/${day} ${timePart}`).getTime();
            };

            const timeA = parseDate(a.dataFim);
            const timeB = parseDate(b.dataFim);
            return timeB - timeA; 
        });
        
        // ORDENAÇÃO DA LISTA DE USUÁRIOS por e-mail
        listaUsuarios.sort((a, b) => a.email.localeCompare(b.email)); 

        
        // =================================================================
        // NOVO: LÓGICA DE VERIFICAÇÃO DE AUTORIZAÇÃO APÓS EXCLUSÃO DO DB
        // Isso impede que um usuário logado no Auth, mas sem registro no DB, 
        // consiga acessar o sistema.
        // =================================================================
        const currentUser = auth.currentUser;
        if (currentUser) {
            const userInDB = listaUsuarios.find(u => u.uid === currentUser.uid);
            
            if (!userInDB) {
                console.warn(`Acesso negado: Usuário ${currentUser.email} sem registro no DB. Forçando logout.`);
                
                // Alerta o usuário antes de deslogar
                alert("Sua conta foi desativada ou removida pelo Administrador. Você será desconectado.");
                
                // Desloga o usuário e o redireciona para a página de login
                auth.signOut();
                return; // Impede a renderização das páginas internas
            }
        }
        // =================================================================
        // FIM DA NOVA LÓGICA
        // =================================================================


        // Renderiza a página ativa
        const activePage = document.querySelector('.content-container:not(.hidden)');
        if (!activePage) return; 
        
        const activePageId = activePage.id;
        
        if (activePageId === 'page-tecnico') {
            renderTechDashboard();
        } else if (activePageId === 'page-paineltv') {
            renderPainelTV();
        } else if (activePageId === 'page-usuarios') { 
            renderUsers(); // Atualiza a lista de usuários
        }
    };
    
    realtimeSyncListener = listenerCallback;
    database.ref('/').on('value', realtimeSyncListener, error => {
        console.error("Erro na sincronização em tempo real do Firebase:", error);
    });
}

function removeRealtimeSync() {
    if (realtimeSyncListener) {
        database.ref('/').off('value', realtimeSyncListener);
        realtimeSyncListener = null;
    }
    filaDeEspera = [];
    emInspecao = [];
    historicoFinalizado = [];
    listaUsuarios = []; 
}

// ---------------------------------------------
// Função para exibir o e-mail do usuário
// ---------------------------------------------
function displayUserEmail(email) {
    const emailSpan = document.getElementById('nav-user-email');
    if (emailSpan) {
        emailSpan.innerHTML = `<i class="fas fa-envelope"></i> ${email}`;
    }
}
// ---------------------------------------------


// ---------------------------------------------
// NOVO: Funções de Gerenciamento de Usuários
// ---------------------------------------------

/**
 * Renderiza a lista de usuários no DOM.
 */
function renderUsers() {
    const usersListBody = document.getElementById('users-list-body');
    if (!usersListBody) return;

    usersListBody.innerHTML = ''; 

    if (listaUsuarios.length === 0) {
        usersListBody.innerHTML = '<p class="empty-message">Nenhum usuário encontrado.</p>';
    } else {
        listaUsuarios.forEach((user) => {
            usersListBody.appendChild(createUserItem(user));
        });
    }
}

/**
 * Cria o elemento HTML (div) para um único usuário.
 * @param {object} user - Objeto do usuário do Firebase.
 * @returns {HTMLElement} O elemento div do item da lista.
 */
function createUserItem(user) {
    const div = document.createElement('div');
    div.classList.add('user-item');
    div.setAttribute('data-uid', user.uid);
    
    // Define a classe de estilo da role
    let roleClass = 'role-recepcao';
    if (user.role === 'tecnico') {
        roleClass = 'role-tecnico';
    } else if (user.role === 'admin') {
         roleClass = 'role-admin';
    }
    
    // Regra de Exclusão: Não pode excluir o usuário atualmente logado (uid diferente)
    const canDelete = auth.currentUser && user.uid !== auth.currentUser.uid;
    
    // O botão de exclusão só é habilitado se não for o usuário logado.
    const deleteButton = canDelete ? 
        `<button onclick="deleteUser('${user.uid}', '${user.email}')"><i class="fas fa-trash-alt"></i> Excluir</button>` :
        '<button disabled><i class="fas fa-lock"></i> Usuário Atual</button>';
    
    div.innerHTML = `
        <span class="user-email">${user.email}</span>
        <span class="user-role-tag ${roleClass}">${user.role ? user.role.toUpperCase() : 'N/A'}</span>
        <div class="user-list-actions">
            ${deleteButton}
        </div>
    `;

    return div;
}

/**
 * Remove o registro de um usuário do nó 'usuarios' do Realtime Database.
 * (NOTA: Esta função NÃO remove a conta do Firebase Authentication, apenas o registro do DB.)
 * * Com a nova lógica em setupRealtimeSync, a remoção deste registro agora 
 * *forçará* o logout do usuário na próxima sincronização de dados.
 * * @param {string} uid - O ID do usuário (chave do nó).
 * @param {string} email - O e-mail do usuário para confirmação.
 */
function deleteUser(uid, email) {
    if (!auth.currentUser) {
        alert("Você precisa estar logado para realizar esta ação.");
        return;
    }
    
    if (confirm(`Tem certeza que deseja remover o usuário ${email} do banco de dados? \n\n(AVISO: Isto não desativa a conta de login, mas bloqueará o acesso na próxima sincronização.)`)) {
        database.ref(`usuarios/${uid}`).remove()
            .then(() => {
                alert(`Usuário ${email} removido do banco de dados. O acesso dele será bloqueado.`);
            })
            .catch(error => {
                console.error("Erro ao remover usuário:", error);
                alert("Erro ao remover usuário do banco de dados.");
            });
    }
}
// ---------------------------------------------


// ---------------------------------------------
// Funções de Renderização (Recepção e Painel TV)
// ---------------------------------------------

function renderTechDashboard() {
    const esperaBody = document.querySelector('#fila-espera-card .card-body');
    const inspecaoBody = document.querySelector('#em-inspecao-card .card-body');
    
    esperaBody.innerHTML = '';
    inspecaoBody.innerHTML = '';

    document.getElementById('count-espera').textContent = filaDeEspera.length;
    document.getElementById('count-inspecao').textContent = emInspecao.length;

    // Fila de Espera
    if (filaDeEspera.length === 0) {
        esperaBody.innerHTML = '<p class="empty-message">Nenhum veículo aguardando.</p>';
    } else {
        filaDeEspera.forEach((veiculo) => {
            esperaBody.appendChild(createQueueItem(veiculo, 'iniciar'));
        });
    }

    // Em Inspeção
    if (emInspecao.length === 0) {
        inspecaoBody.innerHTML = '<p class="empty-message">Nenhum veículo em inspeção.</p>';
    } else {
        emInspecao.forEach((veiculo) => {
            inspecaoBody.appendChild(createQueueItem(veiculo, 'finalizar'));
        });
    }
}

function createQueueItem(veiculo, actionType) {
    const div = document.createElement('div');
    div.classList.add('queue-item');
    
    const isPriority = veiculo.servico === 'CSV'; 
    let tagClass = 'tag-outro'; 

    switch(veiculo.servico) {
        case 'CSV': tagClass = 'tag-csv'; break;
        case 'CIV': tagClass = 'tag-civ'; break;
        case 'CIPP': tagClass = 'tag-cipp'; break;
        case 'LIT': tagClass = 'tag-lit'; break;
        case 'LAUDOS': tagClass = 'tag-laudos'; break;
        case 'DESCONTAMINAÇÃO': tagClass = 'tag-descontaminacao'; break;
        default: tagClass = 'tag-outro';
    }
    
    const dataHoraFormatada = veiculo.dataEntrada ? 
        veiculo.dataEntrada.split(', ')[0] + ', ' + veiculo.dataEntrada.split(', ')[1].substring(0, 5) 
        : 'Data indisponível'; 
    
    const info = document.createElement('div');
    info.classList.add('item-info');
    
    info.innerHTML = `
        <div class="main-info">
            <strong>${veiculo.placa}</strong>
            <span class="item-condutor">(${veiculo.condutor})</span>
        </div>
        
        <div class="item-datetime">
            <i class="fas fa-calendar-alt"></i> ${dataHoraFormatada}
        </div>
        
        <div class="item-details">
            <span class="tag-servico ${tagClass}">
                ${veiculo.servico}
            </span>
            ${isPriority ? '<span class="tag-prioridade"><i class="fas fa-exclamation-triangle"></i> PRIORIDADE</span>' : ''}
        </div>
    `;

    const actions = document.createElement('div');
    actions.classList.add('item-actions');
    const button = document.createElement('button');

    if (actionType === 'iniciar') {
        button.innerHTML = '<i class="fas fa-arrow-left"></i> Chamar'; 
        button.onclick = () => moveVehicle('filaDeEspera', 'emInspecao', veiculo.id);
    } else if (actionType === 'finalizar') {
        button.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar';
        button.onclick = () => removeVehicle('emInspecao', veiculo.id);
    }

    actions.appendChild(button);
    div.appendChild(info);
    div.appendChild(actions);

    return div;
}

function createTVItem(veiculo, isFinalizado = false) { 
    const div = document.createElement('div');
    div.classList.add('tv-item');
    
    let tagClass = 'tag-outro'; 
    switch(veiculo.servico) {
        case 'CSV': tagClass = 'tag-csv'; break;
        case 'CIV': tagClass = 'tag-civ'; break;
        case 'CIPP': tagClass = 'tag-cipp'; break;
        case 'LIT': tagClass = 'tag-lit'; break;
        case 'LAUDOS': tagClass = 'tag-laudos'; break;
        case 'DESCONTAMINAÇÃO': tagClass = 'tag-descontaminacao'; break;
        default: tagClass = 'tag-outro';
    }
    
    let horaDetalhe = '';

    if (isFinalizado && veiculo.dataFim) {
        const partes = veiculo.dataFim.split(', ');
        if(partes.length > 1) {
            horaDetalhe = `Finalizado às ${partes[1].substring(0, 5)}`; 
        }
    } else if (!isFinalizado && veiculo.dataEntrada) {
        const partes = veiculo.dataEntrada.split(', ');
        if(partes.length > 1) {
            horaDetalhe = `Entrada às ${partes[1].substring(0, 5)}`; 
        }
    }
    
    div.innerHTML = `
        <div class="tv-info">
            <strong>${veiculo.placa}</strong>
            <span class="tv-service-tag ${tagClass}">
                ${veiculo.servico}
            </span>
        </div>
        ${horaDetalhe ? 
            `<span class="tv-time-detail ${isFinalizado ? 'tv-time-finished' : ''}">
                ${horaDetalhe}
            </span>` : ''}
    `;

    return div;
}

function renderPainelTV() {
    const tvFilaBody = document.getElementById('tv-fila-body');
    const tvInspecaoBody = document.getElementById('tv-inspecao-body');
    const tvFinalizadoBody = document.getElementById('tv-finalizado-body'); 

    if(tvFilaBody) tvFilaBody.innerHTML = '';
    if(tvInspecaoBody) tvInspecaoBody.innerHTML = '';
    if(tvFinalizadoBody) tvFinalizadoBody.innerHTML = ''; 

    // 1. Renderiza Fila de Espera (Limite de 8 itens exibidos)
    if (filaDeEspera.length === 0) {
        if(tvFilaBody) tvFilaBody.innerHTML = '<p class="empty-message-tv">Nenhum veículo aguardando.</p>';
    } else {
        const tvFila = filaDeEspera.slice(0, 8); 
        tvFila.forEach((veiculo) => {
            if(tvFilaBody) tvFilaBody.appendChild(createTVItem(veiculo));
        });
    }

    // 2. Renderiza Em Inspeção
    if (emInspecao.length === 0) {
        if(tvInspecaoBody) tvInspecaoBody.innerHTML = '<p class="empty-message-tv">Nenhum veículo em inspeção.</p>';
    } else {
        emInspecao.forEach((veiculo) => {
            if(tvInspecaoBody) tvInspecaoBody.appendChild(createTVItem(veiculo));
        });
    }

    // 3. Renderiza Histórico/Finalizados
    if (historicoFinalizado.length === 0) {
        if(tvFinalizadoBody) tvFinalizadoBody.innerHTML = '<p class="empty-message-tv">Nenhum serviço finalizado recentemente.</p>';
    } else {
        historicoFinalizado.forEach((veiculo) => { 
            if(tvFinalizadoBody) tvFinalizadoBody.appendChild(createTVItem(veiculo, true)); 
        });
    }
}


// Funções utilitárias (Voz, Capitalização e Toast)
function speak(text) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR'; 
        window.speechSynthesis.speak(utterance);
    } else {
        console.warn("API de Síntese de Fala não suportada neste navegador.");
    }
}

function capitalizeName(str) {
    if (!str) return '';
    const ignoreWords = ['de', 'da', 'do', 'e', 'a', 'o', 'as', 'os', 'das', 'dos'];
    return str.toLowerCase().split(' ').map(word => {
        if (word.length <= 3 && ignoreWords.includes(word)) {
            return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

function showToast(placa, condutor) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    toast.innerHTML = `Veículo <strong>${placa} (${condutor})</strong> registrado com sucesso!`;
    
    toast.classList.remove('hidden');
    void toast.offsetWidth; 
    toast.classList.add('show'); 
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 500); 
    }, 4000); 
}

function moveVehicle(sourceList, targetList, id) {
    const sourceArray = sourceList === 'filaDeEspera' ? filaDeEspera : emInspecao;
    const veiculo = sourceArray.find(v => v.id === id);

    if (!veiculo) return;
    
    const update = { ...veiculo, status: targetList };

    const updates = {};
    updates[`${sourceList}/${veiculo.id}`] = null; 
    updates[`${targetList}/${veiculo.id}`] = update; 

    database.ref().update(updates)
        .then(() => {
            if (targetList === 'emInspecao') {
                const placaFormatada = veiculo.placa.split('').join(' ');
                speak(`Chamando veículo, placa ${placaFormatada}, para serviço de ${veiculo.servico}. Dirija-se à área de inspeção.`);
            }
        })
        .catch(error => {
            console.error("Erro ao mover veículo no Firebase:", error);
            alert("Erro ao mover veículo. Verifique a conexão.");
        });
}

function removeVehicle(sourceList, id) {
    const veiculo = emInspecao.find(v => v.id === id);

    if (!veiculo) return;

    if (confirm("Confirmar a finalização da inspeção?")) {
        
        const historicoVeiculo = {
            ...veiculo,
            status: 'finalizado',
            dataFim: new Date().toLocaleString('pt-BR') 
        };

        const updates = {};
        updates[`${sourceList}/${veiculo.id}`] = null; 
        updates[`historico/${veiculo.id}`] = historicoVeiculo; 

        database.ref().update(updates)
            .then(() => {
                const placaFormatada = veiculo.placa.split('').join(' ');
                speak(`Serviço de ${veiculo.servico} finalizado para o veículo placa ${placaFormatada}. Obrigado por aguardar.`);

                alert('Inspeção Finalizada! Veículo movido para o Histórico.');
                
                // Agendamento da Exclusão do Histórico após 5 minutos
                const FIVE_MINUTES = 5 * 60 * 1000;
                
                setTimeout(() => {
                    database.ref(`historico/${veiculo.id}`).remove()
                        .then(() => {
                            console.log(`[Timer] Veículo ${veiculo.placa} excluído do Histórico após 5 minutos.`);
                        })
                        .catch(error => {
                            console.error(`[Timer] Erro ao excluir veículo ${veiculo.placa}:`, error);
                        });
                }, FIVE_MINUTES);
            })
            .catch(error => {
                console.error("Erro ao finalizar veículo no Firebase:", error);
                alert("Erro ao finalizar veículo. Verifique a conexão.");
            });
    }
}


// ----------------------------------------------------
// Inicialização
// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
    
    // Força o logout no carregamento da página para garantir a tela de login.
    auth.signOut();
    
    // 1. Inicializa o observador de estado de autenticação
    auth.onAuthStateChanged(user => {
        if (user) {
            // Logado
            setupRealtimeSync();
            toggleMainNav(true);
            displayUserEmail(user.email); 
            setActivePage('page-recepcao'); 
        } else {
            // Deslogado
            removeRealtimeSync();
            toggleMainNav(false);
            displayUserEmail('E-mail'); 
            setActivePage('page-login');
        }
    });

    // 2. Configura os formulários de autenticação
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('cadastro-form')?.addEventListener('submit', handleCadastro);
    document.getElementById('recuperar-form')?.addEventListener('submit', handleRecuperar);
    document.getElementById('nav-logout')?.addEventListener('click', handleLogout);


    // 3. Configura os links de navegação
    document.querySelectorAll('.nav-item:not(#nav-logout), .switch-auth-page').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = e.currentTarget.getAttribute('data-page');
            
            if (e.currentTarget.classList.contains('switch-auth-page')) {
                displayAuthMessage('page-login', '');
                displayAuthMessage('page-cadastro', '');
                displayAuthMessage('page-recuperar', '');
            }

            if (e.currentTarget.id === 'nav-logout') return;
            
            setActivePage(`page-${page}`);
        });
    });

    // 4. Configura o formulário de registro (Recepção)
    const form = document.getElementById('registro-veiculo-form');
    form.addEventListener('submit', function(event) {
        event.preventDefault(); 

        const nomeCondutorInput = document.getElementById('nome-condutor').value.trim();
        const placaVeiculo = document.getElementById('placa-veiculo').value.trim();
        const tipoServico = document.getElementById('tipo-servico').value;

        if (nomeCondutorInput === '' || placaVeiculo === '') {
            alert('Por favor, preencha todos os campos.');
            return;
        }

        const nomeCondutorCapitalized = capitalizeName(nomeCondutorInput);

        const novoVeiculo = {
            condutor: nomeCondutorCapitalized, 
            placa: placaVeiculo.toUpperCase(), 
            servico: tipoServico,
            dataEntrada: new Date().toLocaleString('pt-BR'), 
            status: 'filaDeEspera' 
        };
        
        database.ref('filaDeEspera').push(novoVeiculo)
            .then(() => {
                showToast(novoVeiculo.placa, novoVeiculo.condutor);
                form.reset();
            })
            .catch(error => {
                console.error("Erro ao registrar veículo:", error);
                alert("Erro ao registrar veículo no Firebase. Tente novamente.");
            });
    });
});