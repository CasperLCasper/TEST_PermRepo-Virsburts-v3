import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from './LanguageContext';

const NFT_ABI = [
    "function mintRepository(address recipient, uint256 repositoryId, string calldata repositoryName, uint256 deadline, bytes calldata signature) external returns (uint256)",
    "function repositoryTokens(bytes32 repoHash) external view returns (uint256)",
    "function ownerOf(uint256 tokenId) external view returns (address)",
    "function getBackupCount(uint256 tokenId) external view returns (uint256)",
    "function getManifestURI(uint256 tokenId) external view returns (string)",
    "function getLastMerkleRoot(uint256 tokenId) external view returns (bytes32)"
];

const SUBSCRIPTION_ABI = [
    "function isSubscribed(bytes32 githubHash) external view returns (bool)",
    "function subscribe(bytes32 githubHash) external",
    "function subscriptionPrice() external view returns (uint256)",
    "function getSubscriptionExpiry(bytes32 githubHash) external view returns (uint256)",
    "function getRemainingTime(bytes32 githubHash) external view returns (uint256)"
];

const USDC_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)"
];

function Icon({ name }) {
    return <img src={`/icons/${name}.svg`} className="icon-inline" alt="" aria-hidden="true" />;
}

function getSafeErrorMessage(error, t) {
    if (!error) return t('unknown-error');
    if (typeof error === 'string') return error.substring(0, 200);
    if (error.message && typeof error.message === 'string') {
        return error.message.substring(0, 200);
    }
    return t('unknown-error');
}

function App() {
    const navigate = useNavigate();
    const { currentLanguage, t, switchLanguage } = useLanguage();
    const [config, setConfig] = useState(null);
    const [userAddress, setUserAddress] = useState(null);
    const [signer, setSigner] = useState(null);
    const [githubUser, setGithubUser] = useState(null);
    const [githubUserId, setGithubUserId] = useState(null);
    const [reposData, setReposData] = useState([]);
    const [selectedRepoName, setSelectedRepoName] = useState(null);
    const [subscriptionStatus, setSubscriptionStatus] = useState(null);
    const [walletConnected, setWalletConnected] = useState(false);
    const [status, setStatus] = useState('');
    const [statusType, setStatusType] = useState('success');
    const [error, setError] = useState('');
    const [lastStatusData, setLastStatusData] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSigningForBackup, setIsSigningForBackup] = useState(false);
    const [unfinishedBackup, setUnfinishedBackup] = useState(null);

    const apiJson = useCallback(async (url, options = {}) => {
        const response = await fetch(url, { credentials: 'same-origin', ...options });
        let result;
        try {
            result = await response.json();
        } catch {
            throw new Error(`${t('server-error')} ${response.status}`);
        }
        if (!response.ok && !result.success) {
            const err = new Error(result.error || `HTTP ${response.status}`);
            err.status = response.status;
            err.recoveryRequired = result.recoveryRequired;
            err.backupTxHash = result.backupTxHash;
            throw err;
        }
        return result;
    }, [t]);

    const showConfirmDialog = useCallback((title, message, yesLabel, noLabel) => {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:1000;padding:20px;';
            const box = document.createElement('div');
            box.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:12px;padding:32px;max-width:480px;width:100%;box-sizing:border-box;';
            const titleEl = document.createElement('h2');
            titleEl.textContent = title;
            titleEl.style.cssText = 'color:#79c0ff;margin-bottom:16px;font-size:20px;';
            const messageEl = document.createElement('p');
            messageEl.textContent = message;
            messageEl.style.cssText = 'color:#b0b8c4;margin-bottom:24px;line-height:1.5;font-size:14px;';
            const yesButton = document.createElement('button');
            yesButton.textContent = yesLabel;
            yesButton.style.cssText = 'width:100%;padding:12px;background:linear-gradient(135deg, #238636 0%, #2ea043 100%);color:#fff;border:1px solid #2ea043;border-radius:8px;font-size:16px;cursor:pointer;margin-bottom:8px;font-weight:600;box-shadow:0 2px 8px rgba(35, 134, 54, 0.3);';
            const noButton = document.createElement('button');
            noButton.textContent = noLabel;
            noButton.style.cssText = 'width:100%;padding:12px;background:linear-gradient(135deg, #da3633 0%, #f85149 100%);color:#fff;border:1px solid #f85149;border-radius:8px;font-size:16px;cursor:pointer;font-weight:600;';
            box.appendChild(titleEl);
            box.appendChild(messageEl);
            box.appendChild(yesButton);
            box.appendChild(noButton);
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            const cleanup = () => { overlay.remove(); };
            yesButton.onclick = () => { cleanup(); resolve(true); };
            noButton.onclick = () => { cleanup(); resolve(false); };
            overlay.onclick = (e) => { if (e.target === overlay) { cleanup(); resolve(false); } };
            document.addEventListener('keydown', function onEsc(e) {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', onEsc);
                    cleanup();
                    resolve(false);
                }
            });
            noButton.focus();
        });
    }, []);

    const checkSubscription = useCallback(async () => {
        try {
            const data = await apiJson('/api/subscription/status');
            if (data.success) {
                setSubscriptionStatus(data);
            }
        } catch (e) {
            console.error('Abonementa pārbaudes kļūda:', e);
        }
    }, [apiJson]);

    const checkUnfinishedBackup = useCallback(async (repoName) => {
        if (!repoName) {
            setUnfinishedBackup(null);
            return;
        }

        const selectedRepo = reposData.find(repo => repo.name === repoName);
        if (!selectedRepo || selectedRepo.id == null || !userAddress) {
            setUnfinishedBackup(null);
            return;
        }

        const repoKey = String(selectedRepo.id);
        let storedJobId = localStorage.getItem(`permrepo-job-${repoKey}`);
        let redisJobFound = false;

        try {
            const redisRecovery = await apiJson(
                `/api/recover-job?repositoryId=${encodeURIComponent(selectedRepo.id)}&walletAddress=${encodeURIComponent(userAddress)}`
            );
            if (redisRecovery?.success && redisRecovery.jobId) {
                storedJobId = redisRecovery.jobId;
                redisJobFound = true;
                localStorage.setItem(`permrepo-job-${repoKey}`, storedJobId);
            }
        } catch (lookupError) {
            if (lookupError.status !== 404) {
                console.error('Neizdevās meklēt nepabeigtu backup Redis:', lookupError);
                if (!storedJobId) {
                    setUnfinishedBackup(null);
                    setError(getSafeErrorMessage(lookupError, t));
                    return;
                }
            }
        }

        if (!storedJobId) {
            setUnfinishedBackup(null);
            return;
        }

        try {
            const jobStatus = await apiJson(`/api/job-status?jobId=${encodeURIComponent(storedJobId)}`);

            if (!jobStatus.success) {
                if (redisJobFound) {
                    setUnfinishedBackup(null);
                    return;
                }
                localStorage.removeItem(`permrepo-job-${repoKey}`);
                localStorage.removeItem(`permrepo-backup-tx-${repoKey}`);
                setUnfinishedBackup(null);
                return;
            }

            if (jobStatus.status === 'completed') {
                localStorage.removeItem(`permrepo-job-${repoKey}`);
                localStorage.removeItem(`permrepo-backup-tx-${repoKey}`);
                setUnfinishedBackup(null);
                return;
            }

            if (jobStatus.zipTxId || jobStatus.manifestTxId || jobStatus.backupTxHash) {
                setUnfinishedBackup({
                    jobId: storedJobId,
                    repoName,
                    zipTxId: jobStatus.zipTxId || null,
                    manifestTxId: jobStatus.manifestTxId || null,
                    backupTxHash: jobStatus.backupTxHash || null,
                    status: jobStatus.status
                });
                return;
            }

            localStorage.removeItem(`permrepo-job-${repoKey}`);
            localStorage.removeItem(`permrepo-backup-tx-${repoKey}`);
            setUnfinishedBackup(null);
        } catch (statusError) {
            if (statusError.status === 404 && !redisJobFound) {
                localStorage.removeItem(`permrepo-job-${repoKey}`);
                localStorage.removeItem(`permrepo-backup-tx-${repoKey}`);
                setUnfinishedBackup(null);
            } else {
                console.error('Neizdevās pārbaudīt backup job:', statusError);
                setError(getSafeErrorMessage(statusError, t));
                setUnfinishedBackup(null);
            }
        }
    }, [apiJson, reposData, userAddress, t]);

    useEffect(() => {
        if (selectedRepoName) {
            checkUnfinishedBackup(selectedRepoName);
        } else {
            setUnfinishedBackup(null);
        }
    }, [selectedRepoName, checkUnfinishedBackup]);

    const purchaseSubscription = useCallback(async () => {
        try {
            setIsLoading(true);
            setStatus(t('approving-usdc'));
            setStatusType('progress');
            
            const provider = new ethers.BrowserProvider(window.ethereum);
            const providerSigner = await provider.getSigner();
            
            const subscriptionContract = new ethers.Contract(config.subscriptionAddress, SUBSCRIPTION_ABI, provider);
            const price = await subscriptionContract.subscriptionPrice();
            
            const usdcContract = new ethers.Contract(config.usdcAddress, USDC_ABI, providerSigner);
            const approveTx = await usdcContract.approve(config.subscriptionAddress, price);
            await approveTx.wait();
            
            setStatus(t('purchasing-subscription'));
            
            if (!githubUserId || !Number.isSafeInteger(Number(githubUserId))) throw new Error('Nederīgs GitHub user ID.');
            const githubHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [BigInt(githubUserId)]));
            const subscribeTx = await subscriptionContract.connect(providerSigner).subscribe(githubHash);
            await subscribeTx.wait();

            let confirmedSubscription = null;
            for (let attempt = 0; attempt < 6; attempt += 1) {
                const [isSubscribed, expiry, remainingTime] = await Promise.all([
                    subscriptionContract.isSubscribed(githubHash),
                    subscriptionContract.getSubscriptionExpiry(githubHash),
                    subscriptionContract.getRemainingTime(githubHash)
                ]);

                if (isSubscribed && BigInt(remainingTime) > 0n) {
                    confirmedSubscription = {
                        success: true,
                        isSubscribed: true,
                        expiry: expiry.toString(),
                        remainingTime: remainingTime.toString(),
                        price: price.toString(),
                        githubUser: githubUser,
                        githubUserId: String(githubUserId)
                    };
                    break;
                }

                if (attempt < 5) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            if (!confirmedSubscription) {
                throw new Error('Abonementa transakcija ir apstiprināta, bet tā statusu vēl nevar nolasīt no blokķēdes. Lūdzu, pēc dažām sekundēm mēģini vēlreiz pārbaudīt abonementu.');
            }

            setSubscriptionStatus(confirmedSubscription);
            setStatus(t('subscription-purchased'));
            setStatusType('success');
            setLastStatusData({ type: 'subscription-purchased' });
            setIsLoading(false);
        } catch (e) {
            setIsLoading(false);
            if (e.code === 'ACTION_REJECTED') {
                setError(t('transaction-cancelled'));
            } else {
                setError(e.message);
            }
        }
    }, [config, githubUserId, githubUser, t]);

    const connectWallet = useCallback(async () => {
        if (!window.ethereum) {
            setError(t('install-wallet'));
            return;
        }
        
        try {
            setIsLoading(true);
            setStatus('');
            setError('');
            
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const address = accounts[0];
            
            const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
            
            if (Number.parseInt(currentChainId, 16) !== Number(config.chainId)) {
                try {
                    await window.ethereum.request({ 
                        method: 'wallet_switchEthereumChain', 
                        params: [{ chainId: config.chainId }] 
                    });
                } catch (switchError) {
                    if (switchError.code === 4902) {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: config.chainId,
                                chainName: 'Base',
                                rpcUrls: [config.rpcUrl],
                                nativeCurrency: {
                                    name: 'ETH',
                                    symbol: 'ETH',
                                    decimals: 18
                                }
                            }]
                        });
                    } else {
                        throw switchError;
                    }
                }
            }
            
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signerInstance = await provider.getSigner();
            
            setSigner(signerInstance);
            setUserAddress(address);
            
            const data = await apiJson('/api/github/repos');
            if (!data.success || data.repos.length === 0) {
                setError(t('no-repos-found'));
                setIsLoading(false);
                return;
            }
            
            const nftContract = new ethers.Contract(config.nftAddress, NFT_ABI, provider);
            
            const reposWithStatus = [];
            for (const repo of data.repos) {
                const repoHash = ethers.keccak256(
                    ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [BigInt(repo.id)])
                );
                const tokenId = await nftContract.repositoryTokens(repoHash);
                
                if (tokenId !== 0n) {
                    try {
                        const owner = await nftContract.ownerOf(tokenId);
                        const isOwnedByConnectedWallet = owner.toLowerCase() === address.toLowerCase();
                        const backupCount = await nftContract.getBackupCount(tokenId);
                        const lastManifest = await nftContract.getManifestURI(tokenId);
                        const lastMerkleRoot = await nftContract.getLastMerkleRoot(tokenId);

                        reposWithStatus.push({
                            ...repo,
                            hasNFT: true,
                            nftOwnedByWallet: isOwnedByConnectedWallet,
                            tokenId: tokenId.toString(),
                            backupCount: backupCount.toString(),
                            lastManifest: lastManifest || null,
                            lastMerkleRoot: lastMerkleRoot || null
                        });
                    } catch (nftError) {
                        reposWithStatus.push({ ...repo, hasNFT: true, nftOwnedByWallet: false, tokenId: tokenId.toString() });
                    }
                } else {
                    reposWithStatus.push({ ...repo, hasNFT: false });
                }
            }
            
            setReposData(reposWithStatus);
            setWalletConnected(true);
            
            setStatus(`${t('wallet-connected')}: ${address}`);
            setStatusType('success');
            setLastStatusData({ type: 'wallet-connected', address: address });
            setIsLoading(false);
            
        } catch (e) {
            setIsLoading(false);
            setError(e.message);
        }
    }, [config, apiJson, t]);

    const mintNFT = useCallback(async (repoName) => {
        // NFT minting is allowed without a subscription. Subscription checks
        // apply to backup creation only.
        try {
            setIsLoading(true);
            setStatus(t('mint-preparing'));
            setStatusType('progress');
            setError('');

            const provider = new ethers.BrowserProvider(window.ethereum);
            const nftSigner = await provider.getSigner();
            const nftWrite = new ethers.Contract(config.nftAddress, NFT_ABI, nftSigner);
            
            const repo = reposData.find(item => item.name === repoName);
            if (!repo) throw new Error('Repozitorijs nav atrasts.');

            const authData = await apiJson('/api/mint-authorization', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    repositoryId: repo.id,
                    walletAddress: userAddress
                })
            });

            if (!authData.success || !authData.signature) {
                throw new Error(t('mint-not-authorized'));
            }

            setStatus(t('mint-confirming'));
            setStatusType('progress');

            const tx = await nftWrite.mintRepository(
                userAddress,
                BigInt(repo.id),
                repo.full_name,
                BigInt(authData.deadline),
                authData.signature
            );
            await tx.wait();
            
            setStatus(t('mint-success'));
            setStatusType('success');
            setLastStatusData({ type: 'nft-minted' });
            await connectWallet();
            setIsLoading(false);
        } catch (e) {
            setIsLoading(false);
            if (e.code === 'ACTION_REJECTED') {
                setError(t('transaction-cancelled'));
            } else {
                setError(e.message || t('mint-authorization-failed'));
            }
        }
    }, [config, userAddress, connectWallet, t, apiJson, reposData]);

    const createBackup = useCallback(async (repo) => {
        if (!window.ethereum || !userAddress) {
            setError(t('connect-wallet'));
            return;
        }

        if (!subscriptionStatus?.isSubscribed) {
            setError(t('subscription-required'));
            return;
        }

        try {
            setIsSigningForBackup(true);
            setError('');

            const provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.send('eth_accounts', []);
            const currentAddress = accounts[0] ? ethers.getAddress(accounts[0]) : null;
            if (!currentAddress || currentAddress.toLowerCase() !== userAddress.toLowerCase()) {
                throw new Error(t('wallet-changed'));
            }

            const nftContract = new ethers.Contract(config.nftAddress, NFT_ABI, provider);
            const owner = await nftContract.ownerOf(BigInt(repo.tokenId));
            if (owner.toLowerCase() !== currentAddress.toLowerCase()) {
                throw new Error(t('nft-not-owned'));
            }

            navigate(`/backup?repo=${encodeURIComponent(repo.name)}&repoId=${repo.id}&repoFullName=${encodeURIComponent(repo.full_name)}`, {
                state: {
                    walletAddress: currentAddress,
                    repositoryId: String(repo.id),
                    repositoryFullName: repo.full_name,
                    nftTokenId: repo.tokenId,
                    backupCount: repo.backupCount,
                    lastManifest: repo.lastManifest,
                    lastMerkleRoot: repo.lastMerkleRoot
                }
            });
        } catch (e) {
            if (e.code === 'ACTION_REJECTED' || e.code === 4001) {
                setError(t('transaction-cancelled'));
            } else {
                setError(e.message || t('unknown-error'));
            }
            setIsSigningForBackup(false);
        }
    }, [config, userAddress, navigate, t, subscriptionStatus]);

    const startNewBackupFromMain = useCallback(async (repo) => {
        const confirmed = await showConfirmDialog(
            t('confirm-start-new-backup-title'),
            t('confirm-start-new-backup-message'),
            t('confirm-start-new-backup-yes'),
            t('confirm-start-new-backup-no')
        );
        if (!confirmed) return;

        const repoKey = repo.id != null ? String(repo.id) : repo.name;
        try {
            const deletion = await apiJson('/api/delete-repository-jobs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repositoryId: String(repo.id), walletAddress: userAddress, tokenId: String(repo.tokenId) })
            });

            if (!deletion?.success || Number(deletion.remainingCount) !== 0 || Number(deletion.remainingIndexCount) !== 0 || Number(deletion.remainingLockCount) !== 0) {
                throw new Error(deletion?.error || 'Neizdevās apstiprināt visu šī repozitorija backup job dzēšanu.');
            }

        } catch (deleteError) {
            console.error('Neizdevās pilnībā izdzēst repozitorija backup job:', deleteError);
            setError(getSafeErrorMessage(deleteError, t));
            return;
        }

        // Clear browser recovery pointers only after the server confirms that
        // every Redis job for this repository has been removed.
        try {
            localStorage.removeItem(`permrepo-job-${repoKey}`);
            localStorage.removeItem(`permrepo-backup-tx-${repoKey}`);
            localStorage.removeItem(`permrepo-recovery-${repoKey}`);
        } catch (storageError) {
            console.warn('Neizdevās notīrīt lokālos recovery pointerus:', storageError);
        }

        setUnfinishedBackup(null);
        navigate(`/backup?repo=${encodeURIComponent(repo.name)}&repoId=${repo.id}&repoFullName=${encodeURIComponent(repo.full_name)}`, {
            state: {
                walletAddress: userAddress,
                repositoryId: String(repo.id),
                repositoryFullName: repo.full_name,
                nftTokenId: repo.tokenId,
                backupCount: repo.backupCount,
                lastManifest: repo.lastManifest,
                lastMerkleRoot: repo.lastMerkleRoot
            }
        });
    }, [showConfirmDialog, t, navigate, userAddress, apiJson]);

    useEffect(() => {
        if (lastStatusData && lastStatusData.type === 'wallet-connected' && walletConnected) {
            setStatus(`${t('wallet-connected')}: ${lastStatusData.address}`);
            setStatusType('success');
        }
    }, [currentLanguage, lastStatusData, walletConnected, t]);

    useEffect(() => {
        if (!window.ethereum || !config) return undefined;

        const expectedChainIdHex = typeof config.chainId === 'string' && config.chainId.startsWith('0x')
            ? config.chainId
            : `0x${Number(config.chainId).toString(16)}`;

        const handleAccountsChanged = (accounts) => {
            if (accounts.length === 0) {
                setWalletConnected(false);
                setUserAddress(null);
                setSigner(null);
                setReposData([]);
                setSelectedRepoName(null);
                setError('');
                setUnfinishedBackup(null);
            } else {
                const newAddress = ethers.getAddress(accounts[0]);
                if (userAddress && newAddress.toLowerCase() !== userAddress.toLowerCase()) {
                    setUserAddress(newAddress);
                    setError('');
                    setWalletConnected(false);
                    setReposData([]);
                    setSelectedRepoName(null);
                    setUnfinishedBackup(null);
                    setTimeout(() => {
                        window.location.reload();
                    }, 500);
                }
            }
        };

        const handleChainChanged = async (chainIdHex) => {
            if (chainIdHex.toLowerCase() === expectedChainIdHex.toLowerCase()) {
                setError('');
                return;
            }

            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: expectedChainIdHex }]
                });
                setError('');
            } catch (switchError) {
                if (switchError.code === 4001) {
                    setError(t('network-changed'));
                    setWalletConnected(false);
                    setReposData([]);
                    setSelectedRepoName(null);
                    setUnfinishedBackup(null);
                } else if (switchError.code === 4902) {
                    try {
                        await window.ethereum.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: expectedChainIdHex,
                                chainName: 'Base',
                                rpcUrls: [config.rpcUrl],
                                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
                            }]
                        });
                        setError('');
                    } catch (addError) {
                        setError(t('network-changed'));
                    }
                } else {
                    setError(t('network-changed'));
                }
            }
        };

        window.ethereum.on?.('accountsChanged', handleAccountsChanged);
        window.ethereum.on?.('chainChanged', handleChainChanged);

        return () => {
            window.ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
            window.ethereum.removeListener?.('chainChanged', handleChainChanged);
        };
    }, [config, t, userAddress]);

    useEffect(() => {
        const initApp = async () => {
            try {
                const configData = await apiJson('/api/config');
                setConfig(configData);
            } catch (e) {
                setError(t('config-load-failed'));
                return;
            }
            
            try {
                const userData = await apiJson('/api/github/user');
                if (userData.success) {
                    setGithubUser(userData.user);
                    setGithubUserId(String(userData.userId));
                    await checkSubscription();
                } else if (userData.requiresReauth) {
                    window.location.href = '/api/github/login';
                }
            } catch (e) {
                console.error('Init kļūda:', e);
            }
        };
        
        initApp();
    }, []);

    const selectedRepo = reposData.find(r => r.name === selectedRepoName);

    if (!config) {
        return (
            <div className="container">
                <div style={{ textAlign: 'center', padding: '20px' }}>
                    <div className="spinner"></div>
                </div>
            </div>
        );
    }

    const hasUnfinishedBackup = unfinishedBackup && selectedRepo && unfinishedBackup.repoName === selectedRepo.name;

    return (
        <div className="container">
            <div className="language-selector">
                <button className={`lang-btn ${currentLanguage === 'lv' ? 'active' : ''}`} onClick={() => switchLanguage('lv')}>LV</button>
                <button className={`lang-btn ${currentLanguage === 'en' ? 'active' : ''}`} onClick={() => switchLanguage('en')}>EN</button>
                <button className={`lang-btn ${currentLanguage === 'eo' ? 'active' : ''}`} onClick={() => switchLanguage('eo')}>EO</button>
            </div>
            
            <img src="/icons/logo-nosaukums.svg" alt="PermRepo" className="logo-title" />
            <p className="subtitle">{t('subtitle')}</p>
            
            {subscriptionStatus && (
                <div style={{ display: 'block', marginBottom: '16px' }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <button 
                            disabled={subscriptionStatus.isSubscribed}
                            onClick={subscriptionStatus.isSubscribed ? undefined : purchaseSubscription}
                            style={{ 
                                width: '100%', 
                                padding: '12px', 
                                borderRadius: '8px', 
                                fontSize: '14px',
                                cursor: subscriptionStatus.isSubscribed ? 'default' : 'pointer',
                                background: subscriptionStatus.isSubscribed ? 'rgba(63, 185, 80, 0.1)' : 'rgba(248, 81, 73, 0.1)',
                                border: `1px solid ${subscriptionStatus.isSubscribed ? 'rgba(63, 185, 80, 0.3)' : 'rgba(248, 81, 73, 0.3)'}`,
                                color: subscriptionStatus.isSubscribed ? '#3fb950' : '#f85149',
                                marginTop: '0'
                            }}
                        >
                            <span className={`subscription-dot ${subscriptionStatus.isSubscribed ? 'active' : 'expired'}`}></span>
                            {subscriptionStatus.isSubscribed 
                                ? `${t('subscription-active')} (${Math.floor(Number(subscriptionStatus.remainingTime) / 86400)} ${t('days')})` 
                                : t('subscription-expired')}
                        </button>
                    )}
                </div>
            )}
            
            {!githubUser && (
                <div style={{ display: 'block', marginBottom: '24px' }}>
                    <button 
                        onClick={() => window.location.href = '/api/github/login'}
                        className="sign-button"
                        style={{ marginTop: '0' }}
                    >
                        {t('connect-github')}
                    </button>
                </div>
            )}
            
            {githubUser && (
                <div style={{ display: 'block' }}>
                    <div className="info-row text-left">
                        <span className="info-label">{t('user')}</span>
                        <span className="info-value">{githubUser}</span>
                    </div>
                    <button 
                        onClick={async () => {
                            await fetch('/api/github/logout', { method: 'POST', credentials: 'same-origin' });
                            window.location.href = '/?logout=' + Date.now();
                        }}
                        className="logout-button"
                    >
                        {t('logout')}
                    </button>
                </div>
            )}
            
            {githubUser && !walletConnected && (
                <div style={{ display: 'block', marginTop: '16px' }}>
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                            <div className="spinner"></div>
                        </div>
                    ) : (
                        <button 
                            onClick={connectWallet}
                            className="sign-button"
                        >
                            {t('connect-wallet')}
                        </button>
                    )}
                </div>
            )}
            
            {walletConnected && (
                <div style={{ display: 'block' }}>
                    <div className="info-row text-left">
                        <span className="info-label">{t('wallet')}</span>
                        <span className="info-value" style={{ wordBreak: 'break-all' }}>{userAddress}</span>
                    </div>
                </div>
            )}
            
            {walletConnected && reposData.length > 0 && (
                <div style={{ display: 'block', marginTop: '16px' }}>
                    <div className="info-row text-left">
                        <label className="info-label">{t('repository')}</label>
                        <select 
                            className="repo-select"
                            value={selectedRepoName || ''}
                            onChange={(e) => setSelectedRepoName(e.target.value)}
                            aria-label={t('select-repo')}
                        >
                            <option value="">{t('select-repo')}</option>
                            {reposData.map((repo) => (
                                <option key={repo.name} value={repo.name}>
                                    {repo.hasNFT ? '🟢' : '🔴'} {repo.name}{repo.private ? ' 🔒' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {selectedRepo && (
                        <div style={{ display: 'block', marginTop: '16px' }}>
                            <div className={`repo-status-display ${selectedRepo.hasNFT ? 'has-nft' : 'no-nft'}`}>
                                <Icon name={selectedRepo.hasNFT ? 'ir-nft' : 'nav-nft'} />
                                {selectedRepo.hasNFT ? (selectedRepo.nftOwnedByWallet ? t('nft-linked') : t('nft-not-owned')) : t('no-nft')}
                            </div>
                            
                            {hasUnfinishedBackup && (
                                <div className="unfinished-backup-warning">
                                    {t('unfinished-backup-warning')}
                                    <div className="unfinished-backup-actions">
                                        <button
                                            onClick={() => createBackup(selectedRepo)}
                                            className="sign-button"
                                            style={{
                                                background: 'linear-gradient(135deg, #238636 0%, #1a6b2a 100%)',
                                                border: '1px solid #2ea043',
                                                color: '#fff',
                                                fontWeight: '600'
                                            }}
                                        >
                                            {t('finish-previous-backup')}
                                        </button>
                                        <button
                                            onClick={() => startNewBackupFromMain(selectedRepo)}
                                            className="sign-button start-new-backup-btn"
                                        >
                                            {t('start-new-backup')}
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            {isSigningForBackup ? (
                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                    <div className="spinner"></div>
                                </div>
                            ) : selectedRepo.hasNFT && selectedRepo.nftOwnedByWallet ? (
                                <>
                                    {!subscriptionStatus?.isSubscribed && !hasUnfinishedBackup && (
                                        <div className="error">
                                            <Icon name="kluda" />
                                            {t('subscription-required')}
                                        </div>
                                    )}
                                    {hasUnfinishedBackup ? null : (
                                        <button
                                            onClick={() => startNewBackupFromMain(selectedRepo)}
                                            className="sign-button start-new-backup-btn"
                                            disabled={!subscriptionStatus?.isSubscribed || isLoading}
                                            title={!subscriptionStatus?.isSubscribed ? t('subscription-required') : undefined}
                                        >
                                            {t('start-new-backup')}
                                        </button>
                                    )}
                                </>
                            ) : selectedRepo.hasNFT && !selectedRepo.nftOwnedByWallet ? (
                                <div className="error">
                                    <Icon name="kluda" />
                                    {t('nft-not-owned')}
                                </div>
                            ) : isLoading ? (
                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                    <div className="spinner"></div>
                                </div>
                            ) : (
                                <>
                                    {!subscriptionStatus?.isSubscribed && (
                                        <div className="info">
                                            {t('mint-no-subscription-needed')}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => mintNFT(selectedRepo.name)}
                                        className="sign-button"
                                    >
                                        {t('mint-nft')}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
            
            {status && (
                <div className="status" style={{ marginTop: '20px', textAlign: 'center', color: statusType === 'success' ? '#3fb950' : '#e6edf3' }}>
                    <Icon name={statusType === 'success' ? 'izdevas-veiksmigi' : 'upload'} />
                    {status}
                </div>
            )}
            
            {error && (
                <div className="error">
                    <Icon name="kluda" />
                    {error}
                </div>
            )}
        </div>
    );
}

export default App;
